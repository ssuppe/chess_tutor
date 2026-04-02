import { Stockfish } from "../stockfish";

type MessageHandler = (event: MessageEvent) => void;

class FakeWorker {
    public onmessage: MessageHandler | null = null;
    private listeners = new Set<MessageHandler>();
    private currentFen = "";

    addEventListener(_type: string, handler: MessageHandler) {
        this.listeners.add(handler);
    }

    removeEventListener(_type: string, handler: MessageHandler) {
        this.listeners.delete(handler);
    }

    postMessage(message: string) {
        if (message === "uci") {
            this.onmessage?.({ data: "uciok" } as MessageEvent);
            this.emit("uciok");
            return;
        }

        if (message.startsWith("position fen ")) {
            this.currentFen = message.replace("position fen ", "");
            return;
        }

        if (message.startsWith("go depth")) {
            const response = this.currentFen.includes(" w ")
                ? { info: "info depth 12 score cp 30", bestmove: "bestmove e2e4" }
                : { info: "info depth 12 score cp 50", bestmove: "bestmove d7d5" };

            setTimeout(() => this.emit(response.info), 5);
            setTimeout(() => this.emit(response.bestmove), 10);
        }
    }

    terminate() {}

    private emit(data: string) {
        const event = { data } as MessageEvent;
        this.listeners.forEach((handler) => handler(event));
    }
}

describe("Stockfish", () => {
    beforeEach(() => {
        Object.defineProperty(window, "Worker", {
            writable: true,
            value: FakeWorker,
        });
    });

    it("serializes evaluations and keeps scores isolated per request", async () => {
        const stockfish = new Stockfish();

        const first = stockfish.evaluate("8/8/8/8/8/8/8/8 w - - 0 1", 12);
        const second = stockfish.evaluate("8/8/8/8/8/8/8/8 b - - 0 1", 12);

        await new Promise((resolve) => setTimeout(resolve, 25));

        await expect(first).resolves.toMatchObject({
            bestMove: "e2e4",
            score: 30,
            depth: 12,
        });
        await expect(second).resolves.toMatchObject({
            bestMove: "d7d5",
            score: -50,
            depth: 12,
        });
    });
});
