export type StockfishEvaluation = {
  bestMove: string;
  ponder: string | null;
  score: number; // centipawns, positive for white
  mate: number | null; // moves to mate, positive for white
  depth: number;
};

export class Stockfish {
  private worker: Worker | null = null;
  private isReady: boolean = false;
  private evaluationQueue: Promise<void> = Promise.resolve();

  constructor() {
    if (typeof window !== "undefined") {
      this.worker = new Worker("/stockfish/stockfish.js");
      this.worker.onmessage = (e) => {
        // console.log("Stockfish message:", e.data);
        if (e.data === "uciok") {
          this.isReady = true;
        }
      };
      this.worker.postMessage("uci");
    }
  }

  private waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Stockfish worker not initialized"));
        return;
      }

      const timeoutId = window.setTimeout(() => {
        this.worker?.removeEventListener("message", handleReady);
        reject(new Error("Stockfish worker readiness timed out"));
      }, 5000);

      const handleReady = (event: MessageEvent) => {
        if (event.data === "uciok") {
          window.clearTimeout(timeoutId);
          this.worker?.removeEventListener("message", handleReady);
          this.isReady = true;
          resolve();
        }
      };

      this.worker.addEventListener("message", handleReady);
    });
  }

  async evaluate(fen: string, depth: number = 15, multiPV: number = 1): Promise<StockfishEvaluation> {
    const runEvaluation = async () => {
      await this.waitUntilReady();

      return new Promise<StockfishEvaluation>((resolve, reject) => {
        if (!this.worker) {
          reject(new Error("Stockfish worker not initialized"));
          return;
        }

        let lastScore = 0;
        let lastMate: number | null = null;
        let lastDepth = 0;

        const handler = (event: MessageEvent) => {
          const message = event.data;

          if (typeof message !== "string") {
            return;
          }

          if (message.startsWith("info depth")) {
            const depthMatch = message.match(/depth (\d+)/);
            const scoreMatch = message.match(/score cp (-?\d+)/);
            const mateMatch = message.match(/score mate (-?\d+)/);

            if (depthMatch) lastDepth = parseInt(depthMatch[1], 10);
            if (scoreMatch) {
              lastScore = parseInt(scoreMatch[1], 10);
              lastMate = null;
            }
            if (mateMatch) {
              lastMate = parseInt(mateMatch[1], 10);
              lastScore = 0;
            }
          }

          if (message.startsWith("bestmove")) {
            const parts = message.split(" ");
            const bestMove = parts[1];
            let ponder: string | null = null;
            if (parts.length > 3 && parts[2] === "ponder") {
              ponder = parts[3];
            }

            this.worker?.removeEventListener("message", handler);
            resolve({
              bestMove,
              ponder,
              score: lastScore,
              mate: lastMate,
              depth: lastDepth,
            });
          }
        };

        this.worker.addEventListener("message", handler);
        if (multiPV > 1) {
          this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);
        }
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
      });
    };

    const evaluationPromise = this.evaluationQueue.then(runEvaluation, runEvaluation);
    this.evaluationQueue = evaluationPromise.then(() => undefined, () => undefined);

    return evaluationPromise.then((evalResult: StockfishEvaluation) => {
      // Normalize score to be from White's perspective
      // Stockfish returns score relative to side to move
      const sideToMove = fen.split(" ")[1]; // 'w' or 'b'
      if (sideToMove === 'b') {
        if (evalResult.score !== 0) evalResult.score = -evalResult.score;
        if (evalResult.mate !== null && evalResult.mate !== 0) evalResult.mate = -evalResult.mate;
      }
      return evalResult;
    });
  }

  terminate() {
    this.worker?.terminate();
  }
}
