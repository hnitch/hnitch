// macOS design-time utility: swift scripts/outline-hero-heading.swift
// Only the heading's vector outlines are committed, never a font binary.
// Ordinary profile refreshes run on Linux and do not need this utility.
import Foundation
import CoreText
import CoreGraphics

let name = "HelveticaNeue-MediumItalic"
let font = CTFontCreateWithName(name as CFString, 57, nil)
guard CTFontCopyPostScriptName(font) as String == name else {
    fatalError("The intended heading font is unavailable; refusing a silent substitution")
}
let string = NSAttributedString(string: "hii , i'm hn", attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTKernAttributeName as String): -0.6
])
let line = CTLineCreateWithAttributedString(string)
let shape = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    for i in 0..<count {
        if let outline = CTFontCreatePathForGlyph(font, glyphs[i], nil) {
            shape.addPath(outline, transform: CGAffineTransform(translationX: positions[i].x, y: positions[i].y))
        }
    }
}
func point(_ p: CGPoint) -> String { String(format: "%.2f %.2f", Double(p.x), Double(p.y)) }
var commands = [String]()
shape.applyWithBlock { item in
    let e = item.pointee
    switch e.type {
    case .moveToPoint: commands.append("M" + point(e.points[0]))
    case .addLineToPoint: commands.append("L" + point(e.points[0]))
    case .addQuadCurveToPoint: commands.append("Q" + point(e.points[0]) + " " + point(e.points[1]))
    case .addCurveToPoint: commands.append("C" + point(e.points[0]) + " " + point(e.points[1]) + " " + point(e.points[2]))
    case .closeSubpath: commands.append("Z")
    @unknown default: fatalError("Unsupported path element")
    }
}
let file = URL(fileURLWithPath: "assets/hero.svg")
var svg = try String(contentsOf: file, encoding: .utf8)
let start = "<!-- HERO-HEADING:START -->"
let end = "<!-- HERO-HEADING:END -->"
guard let a = svg.range(of: start), let b = svg.range(of: end), a.upperBound < b.lowerBound else {
    fatalError("Heading markers are missing")
}
let markup = "\n    <g role=\"img\" aria-label=\"hii , i'm hn\" data-typeface=\"\(name)\" transform=\"translate(54 139) scale(1 -1)\" fill=\"#f7f9fc\"><title>hii , i'm hn</title><path d=\"\(commands.joined())\"/></g>\n    "
svg.replaceSubrange(a.upperBound..<b.lowerBound, with: markup)
try svg.write(to: file, atomically: true, encoding: .utf8)
print("Outlined \(name); heading bounds: \(shape.boundingBoxOfPath)")
