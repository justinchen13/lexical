import Cocoa
import WebKit
import Carbon
import ApplicationServices
import CryptoKit

#if arch(arm64)
let nativeArchitecture="arm64"
#else
let nativeArchitecture="other"
#endif

func sourceID(_ source: TISInputSource?) -> String? {
  guard let source, let pointer=TISGetInputSourceProperty(source,kTISPropertyInputSourceID) else {return nil}
  return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}
func systemPinyin() -> TISInputSource? {
  let properties=[kTISPropertyInputSourceID as String:"com.apple.inputmethod.SCIM.ITABC"] as CFDictionary
  let sources=TISCreateInputSourceList(properties,false).takeRetainedValue() as! [TISInputSource]
  return sources.first
}
func digest(_ data:Data) -> String {SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined()}
if CommandLine.arguments.contains("--preflight") {
  let record:[String:Any]=["systemPinyinAvailable":systemPinyin() != nil,"postEventAccess":CGPreflightPostEventAccess(),"accessibilityTrusted":AXIsProcessTrusted(),"frontmostApplicationAvailable":NSWorkspace.shared.frontmostApplication != nil,"os":ProcessInfo.processInfo.operatingSystemVersionString]
  let data=try! JSONSerialization.data(withJSONObject:record,options:[.sortedKeys]);print(String(data:data,encoding:.utf8)!);exit(0)
}

final class Probe: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window:NSWindow!
  var web:WKWebView!
  var output:FileHandle!
  var previousSource:TISInputSource?
  var pinyin:TISInputSource?
  var previousApp:NSRunningApplication?
  var previousAXWindow:AXUIElement?
  var previousAXElement:AXUIElement?
  var scenarios:[[String:Any]]=[]
  var finishing=false
  var armed=false
  var abortReason:String?
  let directory=URL(fileURLWithPath:CommandLine.arguments[1])
  func write(_ record:[String:Any]) {
    var value=record;value["timestamp"]=ISO8601DateFormatter().string(from:Date())
    if let data=try? JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]){output?.write(data);output?.write(Data([10]))}
  }
  func applicationDidFinishLaunching(_ notification:Notification) {
    let events=directory.appendingPathComponent("events.jsonl")
    guard !FileManager.default.fileExists(atPath:events.path) else {fputs("Refusing to overwrite existing native evidence.\n",stderr);exit(2)}
    FileManager.default.createFile(atPath:events.path,contents:nil);output=try! FileHandle(forWritingTo:events)
    previousSource=TISCopyCurrentKeyboardInputSource().takeRetainedValue();previousApp=NSWorkspace.shared.frontmostApplication
    if AXIsProcessTrusted(),let app=previousApp {
      let ax=AXUIElementCreateApplication(app.processIdentifier)
      var value:CFTypeRef?
      if AXUIElementCopyAttributeValue(ax,kAXFocusedWindowAttribute as CFString,&value) == .success,let value,CFGetTypeID(value)==AXUIElementGetTypeID(){previousAXWindow=(value as! AXUIElement)}
      value=nil
      if AXUIElementCopyAttributeValue(ax,kAXFocusedUIElementAttribute as CFString,&value) == .success,let value,CFGetTypeID(value)==AXUIElementGetTypeID(){previousAXElement=(value as! AXUIElement)}
    }
    do {
      let bundle=try Data(contentsOf:directory.appendingPathComponent("after.js"))
      let manifestData=try Data(contentsOf:directory.appendingPathComponent("build-manifest.json"))
      let manifest=try JSONSerialization.jsonObject(with:manifestData) as! [String:Any]
      guard manifest["bundleSha256"] as? String == digest(bundle) else {throw NSError(domain:"probe",code:1,userInfo:[NSLocalizedDescriptionKey:"Bundle does not match prepared manifest"])}
      scenarios=try JSONSerialization.jsonObject(with:Data(contentsOf:directory.appendingPathComponent("scenarios.json"))) as! [[String:Any]]
      guard scenarios.count==20 else {throw NSError(domain:"probe",code:2,userInfo:[NSLocalizedDescriptionKey:"Expected exactly 20 authorized scenarios"])}
      write(["type":"capture-start","revision":"dom-target-v1","variant":"final-only","architecture":nativeArchitecture,"binarySha256":digest(try Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[0]))),"scenarioCount":scenarios.count,"bundleSha256":digest(bundle),"buildManifestSha256":digest(manifestData),"scenarioPlanSha256":digest(try Data(contentsOf:directory.appendingPathComponent("scenarios.json"))),"os":ProcessInfo.processInfo.operatingSystemVersionString,"webkit":Bundle(identifier:"com.apple.WebKit")?.infoDictionary?["CFBundleVersion"] as? String ?? "unknown","postEventAccess":CGPreflightPostEventAccess(),"accessibilityTrusted":AXIsProcessTrusted()])
    } catch {write(["type":"fatal","reason":String(describing:error)]);Task{@MainActor in await finish(success:false)};return}
    pinyin=systemPinyin()
    guard pinyin != nil && CGPreflightPostEventAccess() else {write(["type":"fatal","reason":"Pinyin or event permission unavailable"]);Task{@MainActor in await finish(success:false)};return}
    let config=WKWebViewConfiguration();config.userContentController.add(self,name:"evidence")
    web=WKWebView(frame:NSRect(x:0,y:0,width:800,height:440),configuration:config);web.navigationDelegate=self
    window=NSWindow(contentRect:web.frame,styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.delegate=self;window.title="Lexical final Pinyin validation — 20 scenarios";window.contentView=web;window.center()
    window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true);window.makeFirstResponder(web)
    web.loadFileURL(directory.appendingPathComponent("index.html"),allowingReadAccessTo:directory)
    Task{@MainActor in try? await Task.sleep(for:.seconds(120));if !finishing{abortReason="Probe time limit exceeded";write(["type":"fatal","reason":abortReason!]);await finish(success:false)}}
  }
  func windowDidResignKey(_ notification:Notification){if armed && !finishing && abortReason==nil{abortReason="Probe lost foreground focus";write(["type":"focus-abort","reason":abortReason!])}}
  func windowShouldClose(_ sender:NSWindow)->Bool{if finishing{return true};abortReason="User closed probe";if !armed{Task{@MainActor in await finish(success:false)}};return false}
  func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage){
    guard let string=message.body as? String,let data=string.data(using:.utf8),var record=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any] else{return}
    if record["type"] as? String == "probe-failure" {abortReason=record["message"] as? String ?? "JavaScript probe failure"}
    record["source"]="WKWebView";write(record)
  }
  func webView(_ view:WKWebView,didFinish navigation:WKNavigation!){Task{@MainActor in try? await Task.sleep(for:.milliseconds(700));await run()}}
  @MainActor func js(_ code:String) async -> Any? {
    do{return try await web.evaluateJavaScript(code)}catch{abortReason="JavaScript evaluation failed: \(error)";write(["type":"fatal","reason":abortReason!]);return nil}
  }
  @MainActor func key(_ code:CGKeyCode,scenario:String) async -> Bool {
    guard abortReason==nil && NSApp.isActive && window.isKeyWindow else {abortReason=abortReason ?? "Probe lost foreground focus";return false}
    guard sourceID(TISCopyCurrentKeyboardInputSource().takeRetainedValue())=="com.apple.inputmethod.SCIM.ITABC" else {abortReason="Input source changed during test";return false}
    let source=CGEventSource(stateID:.hidSystemState)
    guard let down=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:true),let up=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:false)else{abortReason="Could not create HID key";return false}
    down.flags=[];up.flags=[]
    write(["type":"hid-post","scenario":scenario,"keyCode":code,"down":true,"flags":0,"inputSource":"com.apple.inputmethod.SCIM.ITABC"])
    down.post(tap:.cghidEventTap);try? await Task.sleep(for:.milliseconds(55))
    // Release a pending key even if focus was lost; never send another keydown.
    up.post(tap:.cghidEventTap);write(["type":"hid-post","scenario":scenario,"keyCode":code,"down":false,"flags":0])
    try? await Task.sleep(for:.milliseconds(220));return abortReason==nil
  }
  @MainActor func validate(_ stage:String,scenario:String) async -> Bool {
    guard let result=await js("validateProbe('\(stage)')") as? [String:Any]else{return false}
    write(["type":stage,"scenario":scenario,"result":result])
    if result["ok"] as? Bool != true {abortReason="Native observation differs from prepared expectation in \(scenario)/\(stage)";write(["type":"observation-mismatch","scenario":scenario,"stage":stage,"result":result]);return false}
    return true
  }
  @MainActor func run() async {
    armed=true
    for (index,scenario) in scenarios.enumerated() {
      if abortReason != nil {break}
      let id=scenario["id"] as! String
      let data=try! JSONSerialization.data(withJSONObject:scenario,options:[.sortedKeys]);let json=String(data:data,encoding:.utf8)!
      guard await js("resetProbe(\(json))") != nil else{break}
      if let pinyin {let status=TISSelectInputSource(pinyin);write(["type":"input-source","scenario":id,"selectResult":status,"selected":sourceID(TISCopyCurrentKeyboardInputSource().takeRetainedValue()) ?? "unknown"])}
      try? await Task.sleep(for:.milliseconds(250))
      guard await key(45,scenario:id),await key(34,scenario:id) else{break}
      guard await validate("composing",scenario:id)else{break}
      let action=scenario["cancel"] as! String
      let codes:[CGKeyCode]=action=="backspace" ? [51,51] : action=="space" ? [49] : action=="enter" ? [36] : [53]
      for code in codes {if !(await key(code,scenario:id)){break}}
      if abortReason != nil {break}
      try? await Task.sleep(for:.milliseconds(150))
      guard await validate("cancel-result",scenario:id),await key(36,scenario:id),await validate("enter-result",scenario:id)else{break}
      if scenario["backspaceExpected"] != nil || scenario["ordinaryBackspace"] as? Bool == true {
        guard await key(51,scenario:id),await validate("backspace-result",scenario:id)else{break}
      }
      write(["type":"scenario-passed","scenario":id,"index":index+1,"count":scenarios.count])
      print("Native scenario \(index+1)/\(scenarios.count): \(id) passed");fflush(stdout)
    }
    if let reason=abortReason{write(["type":"fatal","reason":reason])}
    await finish(success:abortReason==nil)
  }
  @MainActor func finish(success:Bool) async {
    guard !finishing else{return};finishing=true;armed=false
    var sourceStatus:Int32 = -1
    if let previousSource{sourceStatus=TISSelectInputSource(previousSource)}
    window?.orderOut(nil)
    let activated=previousApp?.activate(options:[]) ?? false
    try? await Task.sleep(for:.milliseconds(350))
    var windowCode:Int32 = -1,elementCode:Int32 = -1
    if let previousAXWindow{windowCode=AXUIElementPerformAction(previousAXWindow,kAXRaiseAction as CFString).rawValue}
    if let previousAXElement{elementCode=AXUIElementSetAttributeValue(previousAXElement,kAXFocusedAttribute as CFString,kCFBooleanTrue).rawValue}
    if let previousSource{sourceStatus=TISSelectInputSource(previousSource)}
    try? await Task.sleep(for:.milliseconds(150))
    let restoredSource=sourceID(TISCopyCurrentKeyboardInputSource().takeRetainedValue())==sourceID(previousSource)
    let restoredApp=NSWorkspace.shared.frontmostApplication?.processIdentifier==previousApp?.processIdentifier
    var restoredElement=false
    if let app=previousApp,let previousAXElement {
      let ax=AXUIElementCreateApplication(app.processIdentifier);var current:CFTypeRef?
      if AXUIElementCopyAttributeValue(ax,kAXFocusedUIElementAttribute as CFString,&current) == .success,let current{restoredElement=CFEqual(current,previousAXElement)}
    }
    write(["type":"restored","inputSourceStatus":sourceStatus,"inputSourceRestored":restoredSource,"previousApplicationActivated":activated,"previousApplicationFocused":restoredApp,"previousFocusElementAvailable":previousAXElement != nil,"previousFocusElementRestored":restoredElement,"windowRestoreCode":windowCode,"elementRestoreCode":elementCode])
    write(["type":"finished","success":success,"reason":abortReason ?? "completed"])
    try? output?.synchronize();try? output?.close();window?.close();exit(success && restoredSource && restoredApp ? 0 : 1)
  }
}
let app=NSApplication.shared;let delegate=Probe();app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
