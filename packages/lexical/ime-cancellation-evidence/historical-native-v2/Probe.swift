import Cocoa
import WebKit
import Carbon

final class Probe: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var output: FileHandle!
  var previous: TISInputSource?
  let directory = URL(fileURLWithPath: CommandLine.arguments[1])
  let cases = ["backspace", "escape", "confirm", "empty", "selection", "nbsp", "multi", "intercepted"]
  func write(_ record: [String:Any]) { if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) {output.write(data);output.write(Data([10]))} }
  func applicationDidFinishLaunching(_ notification: Notification) {
    let url = directory.appendingPathComponent("events.jsonl")
    FileManager.default.createFile(atPath:url.path, contents:nil)
    output = try! FileHandle(forWritingTo:url)
    previous = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
    let properties = [kTISPropertyInputSourceID as String:"com.apple.inputmethod.SCIM.ITABC"] as CFDictionary
    let sources = TISCreateInputSourceList(properties, false).takeRetainedValue() as! [TISInputSource]
    guard let source = sources.first else {write(["type":"fatal","reason":"System Pinyin not available"]);NSApp.terminate(nil);return}
    let result = TISSelectInputSource(source)
    write(["type":"environment","os":ProcessInfo.processInfo.operatingSystemVersionString,"inputSource":"com.apple.inputmethod.SCIM.ITABC","selectResult":result,"webkit":Bundle(identifier:"com.apple.WebKit")?.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"])
    let config = WKWebViewConfiguration()
    config.userContentController.add(self,name:"evidence")
    web = WKWebView(frame:NSRect(x:0,y:0,width:720,height:420), configuration:config)
    web.navigationDelegate = self
    window = NSWindow(contentRect:web.frame,styleMask:[.titled,.closable],backing:.buffered,defer:false)
    window.title = "Lexical system Pinyin reproduction"
    window.contentView = web
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps:true)
    window.makeFirstResponder(web)
    web.loadFileURL(directory.appendingPathComponent("index.html"),allowingReadAccessTo:directory)
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {if let string=message.body as? String {output.write(Data((string+"\n").utf8))}}
  func webView(_ view:WKWebView,didFinish navigation:WKNavigation!) {Task {@MainActor in try? await Task.sleep(for:.seconds(1));await run()}}
  @MainActor func js(_ script:String) async -> Any? {try? await web.evaluateJavaScript(script)}
  @MainActor func key(_ code:CGKeyCode) async {
    guard NSApp.isActive && window.isKeyWindow else {
      write(["type":"fatal","reason":"Probe lost foreground focus; no further keys sent"])
      if let previous {TISSelectInputSource(previous)}
      NSApp.terminate(nil)
      return
    }
    let source=CGEventSource(stateID:.hidSystemState)
    for down in [true,false] {let e=CGEvent(keyboardEventSource:source,virtualKey:code,keyDown:down);e?.flags=[];e?.post(tap:.cghidEventTap);try? await Task.sleep(for:.milliseconds(60))}
    try? await Task.sleep(for:.milliseconds(220))
  }
  @MainActor func run() async {
    for variant in ["before","after"] {for scenario in cases {
      _ = await js("resetProbe('\(variant)','\(scenario)')")
      try? await Task.sleep(for:.milliseconds(250))
      await key(45);await key(34)
      if scenario == "backspace" || scenario == "empty" {await key(51);await key(51)}
      else if scenario == "confirm" {await key(49)}
      else {await key(53)}
      try? await Task.sleep(for:.milliseconds(250))
      if let state=await js("snapshotProbe()") {write(["type":"cancel-result","variant":variant,"scenario":scenario,"state":state])}
      await key(36)
      try? await Task.sleep(for:.milliseconds(150))
      if let state=await js("snapshotProbe()") {write(["type":"enter-result","variant":variant,"scenario":scenario,"state":state])}
    }}
    if let previous {TISSelectInputSource(previous)}
    write(["type":"finished"])
    window.close()
    NSApp.terminate(nil)
  }
}
let app=NSApplication.shared
let delegate=Probe()
app.delegate=delegate
app.setActivationPolicy(.regular)
app.run()
