export function calculateShadowColor(color: string): string {
    const rgb = hexToRgb(color);
    const shadowRgb = rgb.map((c: number) => Math.floor(c * 0.25));
    return rgbToHex(shadowRgb);
}

export function hexToRgb(hex: string): number[] {
    return (
        hex
            .replace(/^#/, "")
            .match(/.{2}/g)
            ?.map((c) => parseInt(c, 16)) ?? [0, 0, 0]
    );
}

export function rgbToHex(rgb: number[]): string {
    return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
}
