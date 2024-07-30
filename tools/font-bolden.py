'''
Used to generate a bold version of the (fixed) MinecraftSeven font.
'''

from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import RecordingPen

def make_bold(input_font_path, output_font_path, offset_amount):
    font = TTFont(input_font_path)
    glyf_table = font['glyf']
    hmtx_table = font['hmtx']

    for glyph_name in glyf_table.keys():
        if glyph_name == ".notdef":
            continue

        glyph = glyf_table[glyph_name]
        if glyph.isComposite():
            continue

        # Create a pen to record the original glyph
        recording_pen = RecordingPen()
        glyph.draw(recording_pen, glyf_table)

        # Create a new glyph pen to combine the original and offset glyphs
        new_pen = TTGlyphPen(glyf_table)

        # Draw the original glyph
        recording_pen.replay(new_pen)

        # Create a transform pen to offset the original glyph
        transform_pen = TransformPen(new_pen, (1, 0, 0, 1, offset_amount, 0))

        # Replay the original glyph into the transform pen to apply the offset
        recording_pen.replay(transform_pen)

        # Get the new glyph from the pen
        new_glyph = new_pen.glyph()

        # Replace the glyph with the new bold glyph
        glyf_table[glyph_name] = new_glyph

        # Increase the advance width by the offset amount
        width, lsb = hmtx_table[glyph_name]
        hmtx_table[glyph_name] = (width + offset_amount, lsb)

    font.save(output_font_path)
    print(f"Bold font saved as {output_font_path}")

# Usage
input_font_path = "../public/MinecraftSevenv2-Game.ttf"
output_font_path = "../public/MinecraftSevenv2-Game-Bold.ttf"
offset_amount = 100  # Adjust the offset to make the bold effect more or less pronounced

make_bold(input_font_path, output_font_path, offset_amount)