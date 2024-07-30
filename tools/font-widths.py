'''
Used to extract the widths of every character in the fonts, used by the magic style 
to find a random character of the same width.
'''

import json
from fontTools.ttLib import TTFont

def extract_glyph_widths(ttf_path, output_json_path):
    # Load the TTF file
    font = TTFont(ttf_path)
    
    # Initialize a dictionary to hold widths and their corresponding characters
    width_to_chars = {}
    
    # Get the horizontal metrics table
    hmtx = font['hmtx']
    
    # Get the cmap table to map glyph names to Unicode characters
    cmap = font.getBestCmap()
    
    # Create a reverse cmap to map glyph names to Unicode code points
    reverse_cmap = {}
    for code_point, glyph_name in cmap.items():
        if glyph_name not in reverse_cmap:
            reverse_cmap[glyph_name] = []
        reverse_cmap[glyph_name].append(code_point)
    
    # Iterate over all glyphs in the font
    for glyph_name in font.getGlyphOrder():
        if glyph_name in hmtx.metrics:
            width, _ = hmtx[glyph_name]
            
            # Find corresponding Unicode code points
            if glyph_name in reverse_cmap:
                code_points = reverse_cmap[glyph_name]
                
                # Group by width
                if width not in width_to_chars:
                    width_to_chars[width] = []
                width_to_chars[width].extend(code_points)
    
    # Write the width to characters mapping to a JSON file
    with open(output_json_path, 'w', encoding='utf-8') as json_file:
        json.dump(width_to_chars, json_file, ensure_ascii=False)
    
    # Close the font file
    font.close()
    print(f"Glyph widths extracted and saved to {output_json_path}")

ttf_path = '../public/MinecraftSevenv2-Game.ttf'
output_json_path = '../src/glyph_widths_regular.json'
extract_glyph_widths(ttf_path, output_json_path)

ttf_path = '../public/MinecraftSevenv2-Game-Bold.ttf'
output_json_path = '../src/glyph_widths_bold.json'
extract_glyph_widths(ttf_path, output_json_path)
