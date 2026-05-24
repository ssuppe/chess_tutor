import { Chess, Move } from "chess.js";

import { OpeningMetadata } from "@/lib/openings";
import { StockfishEvaluation } from "@/lib/stockfish";
import { detectMissedTactics, uciToSan, DetectedTactic } from "@/lib/tacticDetection";
import { MoveHistoryItem } from "@/components/GameOverModal";

const PIECE_VALUES: Record<string, number> = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0,
};

export type CapturedState = {
    whitePiecesLost: string[];
    blackPiecesLost: string[];
    whiteLostScore: number;
    blackLostScore: number;
};

export function getCapturedState(gameOrFen: Chess | string): CapturedState {
    const chess = typeof gameOrFen === 'string' ? new Chess(gameOrFen) : gameOrFen;
    
    // Define the full set of pieces for a standard game
    const fullSet: Record<string, number> = {
        'w-p': 8, 'w-n': 2, 'w-b': 2, 'w-r': 2, 'w-q': 1,
        'b-p': 8, 'b-n': 2, 'b-b': 2, 'b-r': 2, 'b-q': 1
    };

    // Count current pieces on board
    const currentCount: Record<string, number> = {};
    chess.board().forEach(row => {
        row.forEach(piece => {
            if (piece) {
                const key = `${piece.color}-${piece.type}`;
                currentCount[key] = (currentCount[key] || 0) + 1;
            }
        });
    });

    const whitePiecesLost: string[] = [];
    const blackPiecesLost: string[] = [];
    let whiteLostScore = 0;
    let blackLostScore = 0;

    // Calculate lost pieces by subtracting current count from full set
    Object.entries(fullSet).forEach(([key, count]) => {
        const [color, type] = key.split('-');
        const lost = Math.max(0, count - (currentCount[key] || 0));
        
        for (let i = 0; i < lost; i++) {
            if (color === 'w') {
                whitePiecesLost.push(type);
                whiteLostScore += PIECE_VALUES[type] || 0;
            } else {
                blackPiecesLost.push(type);
                blackLostScore += PIECE_VALUES[type] || 0;
            }
        }
    });

    return {
        whitePiecesLost,
        blackPiecesLost,
        whiteLostScore,
        blackLostScore,
    };
}

interface BuildMoveHistoryItemArgs {
    computerMove: Move;
    evalP0: StockfishEvaluation;
    fenAfterComputerMove: string;
    fenBeforePlayerMove: string;
    openingData: OpeningMetadata[];
    p1Eval: StockfishEvaluation;
    p2Eval: StockfishEvaluation;
    playerColor: "white" | "black";
    playerMove: Move;
    moveNumber: number;
}

export function buildMoveHistoryItem(args: BuildMoveHistoryItemArgs): {
    historyItem: MoveHistoryItem;
    missedTactics: DetectedTactic[];
} {
    const {
        computerMove,
        evalP0,
        fenAfterComputerMove,
        fenBeforePlayerMove,
        openingData,
        p1Eval,
        p2Eval,
        playerColor,
        playerMove,
        moveNumber,
    } = args;

    const isWhite = playerColor === "white";
    const evalBefore = isWhite ? evalP0.score : -evalP0.score;
    const evalAfterPlayerMove = isWhite ? -p1Eval.score : p1Eval.score;
    const cpLoss = evalBefore - evalAfterPlayerMove;
    const bestMoveSan = uciToSan(fenBeforePlayerMove, evalP0.bestMove);
    const missedTactics = detectMissedTactics({
        fen: fenBeforePlayerMove,
        playerColor,
        playerMoveSan: playerMove.san,
        bestMoveUci: evalP0.bestMove,
        cpLoss,
    });

    return {
        historyItem: {
            moveNumber,
            playerMove: playerMove.san,
            playerColor,
            fenBeforePlayerMove,
            evalBeforePlayerMove: evalP0,
            fenAfterPlayerMove: playerMove.after,
            evalAfterPlayerMove: p1Eval,
            computerMove: computerMove.san,
            fenAfterComputerMove,
            evalAfterComputerMove: p2Eval,
            opening: openingData.length > 0 ? openingData[0].name : undefined,
            move: playerMove.san,
            evalBefore: evalP0.score,
            evalAfter: p1Eval.score,
            bestMove: evalP0.bestMove,
            bestMoveSan,
            cpLoss,
            missedTactics,
        },
        missedTactics,
    };
}


export function generateHumanReadableBoard(fen: string): string {
    const chess = new Chess(fen);
    const board = chess.board();
    const whitePieces: string[] = [];
    const blackPieces: string[] = [];

    const pieceNames: Record<string, string> = {
        p: "Pawn",
        n: "Knight",
        b: "Bishop",
        r: "Rook",
        q: "Queen",
        k: "King",
    };

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const square = `${String.fromCharCode(97 + c)}${8 - r}`;
                const name = pieceNames[piece.type];
                const desc = `${name} on ${square}`;
                if (piece.color === "w") {
                    whitePieces.push(desc);
                } else {
                    blackPieces.push(desc);
                }
            }
        }
    }

    return `White pieces: ${whitePieces.join(", ")}. Black pieces: ${blackPieces.join(", ")}.`;
}
