import { getMoveHighlight, MOVE_HIGHLIGHT_STYLE } from "../chessStyles";

describe("getMoveHighlight utility", () => {
    it("should return empty object for null input", () => {
        expect(getMoveHighlight(null)).toEqual({});
    });

    it("should handle Move object from chess.js", () => {
        const move = { from: "e2", to: "e4", color: "w", flags: "b", san: "e4", piece: "p" } as any;
        const expected = {
            e2: MOVE_HIGHLIGHT_STYLE,
            e4: MOVE_HIGHLIGHT_STYLE,
        };
        expect(getMoveHighlight(move)).toEqual(expected);
    });

    it("should handle simple {from, to} objects", () => {
        const move = { from: "d2", to: "d4" };
        const expected = {
            d2: MOVE_HIGHLIGHT_STYLE,
            d4: MOVE_HIGHLIGHT_STYLE,
        };
        expect(getMoveHighlight(move)).toEqual(expected);
    });

    it("should handle UCI strings", () => {
        const move = "g1f3";
        const expected = {
            g1: MOVE_HIGHLIGHT_STYLE,
            f3: MOVE_HIGHLIGHT_STYLE,
        };
        expect(getMoveHighlight(move)).toEqual(expected);
    });

    it("should handle UCI strings with promotion", () => {
        const move = "a7a8q";
        const expected = {
            a7: MOVE_HIGHLIGHT_STYLE,
            a8: MOVE_HIGHLIGHT_STYLE,
        };
        expect(getMoveHighlight(move)).toEqual(expected);
    });

    it("should return empty object for invalid/short UCI strings", () => {
        expect(getMoveHighlight("e2")).toEqual({});
        expect(getMoveHighlight("")).toEqual({});
    });

    it("should return empty object for incomplete objects", () => {
        expect(getMoveHighlight({ from: "e2" } as any)).toEqual({});
    });
});
