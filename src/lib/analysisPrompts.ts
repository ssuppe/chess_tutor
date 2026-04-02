import { Chess, Move } from "chess.js";

import { SupportedLanguage } from "@/lib/i18n/translations";
import { OpeningMetadata } from "@/lib/openings";
import { StockfishEvaluation } from "@/lib/stockfish";
import { DetectedTactic } from "@/lib/tacticDetection";

function formatEvaluationText(evaluation: StockfishEvaluation | null) {
    return `${evaluation?.score ?? "N/A"} centipawns ${
        evaluation?.score !== undefined
            ? evaluation.score > 0
                ? "(White is better)"
                : evaluation.score < 0
                    ? "(Black is better)"
                    : "(Equal)"
            : ""
    }`;
}

function formatOpenings(openingData: OpeningMetadata[]) {
    return openingData.length > 0
        ? openingData.map((opening) => `${opening.name} (${opening.eco})`).join(", ")
        : "Unknown/Midgame";
}

export function buildTeachingPrompt(
    text: string,
    currentFen: string,
    evaluation: StockfishEvaluation | null,
    openingData: OpeningMetadata[],
    language: SupportedLanguage
) {
    const openings = formatOpenings(openingData);
    const evaluationText = formatEvaluationText(evaluation);
    const lower = text.toLowerCase();

    if (lower.includes("best move") || lower.includes("solution") || lower.includes("tell me")) {
        return `[SYSTEM TRIGGER: exact_move]

TEACHING MODE ACTIVATED:
The User is asking for the exact best move. This is a learning moment.
As their TUTOR, you MUST help them - this is your primary purpose.
Even though you are their opponent, teaching them is more important than hiding information.

User Question: ${text}

Current Position Data:
- FEN: ${currentFen}
- Best Move: ${evaluation?.bestMove}
- Evaluation: ${evaluationText}
- Mate in: ${evaluation?.mate || "None"}
- Possible Openings: ${openings}

INSTRUCTIONS:
- Tell them the best move clearly
- Explain why it is the best move
- Stay in your personality style, but be helpful and educational`;
    }

    if (lower.includes("hint") || lower.includes("tip") || lower.includes("help")) {
        return `[SYSTEM TRIGGER: hint]

TEACHING MODE ACTIVATED:
The User is asking for a hint. This is a learning moment.
As their TUTOR, you MUST help them.

User Question: ${text}

Current Position Data:
- FEN: ${currentFen}
- Best Move: ${evaluation?.bestMove}
- Evaluation: ${evaluationText}
- Mate in: ${evaluation?.mate || "None"}
- Possible Openings: ${openings}

INSTRUCTIONS:
- Give a helpful hint without revealing the exact move unless requested
- Point them toward tactics, threats, or weaknesses`;
    }

    return `
User Question: ${text}

Current Position Context:
- FEN: ${currentFen}
- Evaluation: ${evaluationText}
- Best Move: ${evaluation?.bestMove ?? "N/A"}
- Mate in: ${evaluation?.mate || "None"}
- Possible Openings: ${openings}

INSTRUCTIONS:
- Answer the question based on the current position
- Stay in character and be educational
- Respond in ${language}`;
}

export function buildAutomaticAnalysisPrompt(args: {
    computerMove: Move;
    currentFen: string;
    evalP0: StockfishEvaluation;
    evalP2: StockfishEvaluation;
    game: Chess;
    language: SupportedLanguage;
    missedTactics: DetectedTactic[] | null;
    openingData: OpeningMetadata[];
    playerColorName: string;
    tutorColorName: string;
    userMove: Move;
}) {
    const { computerMove, currentFen, evalP0, evalP2, game, language, missedTactics, openingData, playerColorName, tutorColorName, userMove } = args;
    const preScore = evalP0.score;
    const postScore = evalP2.score;
    const preMate = evalP0.mate;
    const postMate = evalP2.mate;
    const delta = postScore - preScore;

    const preEvalStr = preMate !== null ? `Mate in ${preMate}` : `${preScore} cp`;
    const postEvalStr = postMate !== null ? `Mate in ${postMate}` : `${postScore} cp`;

    const isSignificant = preMate !== null || postMate !== null || Math.abs(delta) >= 50;
    const evalInstruction = isSignificant
        ? preMate !== null || postMate !== null
            ? "The evaluation involves MATE. You MUST comment on this critical situation and what caused it."
            : `The evaluation changed SIGNIFICANTLY (Delta: ${delta} cp). You MUST comment on this shift in power and what caused it.`
        : "The evaluation change is MINOR/INSIGNIFICANT. Do NOT mention the score, 'advantage', or who is winning. Focus ONLY on the strategic purpose of the moves.";

    let openingInstruction = "NO specific opening identified from database. Do NOT invent an opening name. Focus on the position.";
    if (openingData.length === 1) {
        const opening = openingData[0];
        openingInstruction = `
OPENING IDENTIFIED: ${opening.name} (${opening.eco}).
You can confidently reference this opening and its typical plans.
You can use this metadata to explain the position:
- Strengths (White): ${opening.meta?.strengths_white?.join(", ") || "N/A"}
- Weaknesses (White): ${opening.meta?.weaknesses_white?.join(", ") || "N/A"}
- Strengths (Black): ${opening.meta?.strengths_black?.join(", ") || "N/A"}
- Weaknesses (Black): ${opening.meta?.weaknesses_black?.join(", ") || "N/A"}
        `;
    } else if (openingData.length > 1) {
        openingInstruction = `
OPENING CONTEXT:
Multiple openings are possible from this position:
${openingData.map((opening) => `- ${opening.name} (${opening.eco})`).join("\n")}

INSTRUCTIONS:
- Do NOT claim a specific opening is being played yet
- You may mention "this could lead to..." or "typical of openings like..."
- Focus on general principles rather than specific opening theory
        `;
    }

    let tacticalInstruction = "";
    const meaningfulTactics = (missedTactics || []).filter((tactic) => tactic.tactic_type !== "none");
    if (meaningfulTactics.length > 0) {
        const tacticDescriptions = meaningfulTactics.map((tactic) => {
            let description = `- ${tactic.tactic_type.toUpperCase()}`;
            if (tactic.piece_roles && tactic.piece_roles.length > 0) {
                description += ` involving ${tactic.piece_roles.join(" and ")}`;
            }
            if (tactic.material_delta) {
                description += ` (worth ~${tactic.material_delta} centipawns)`;
            }
            if (tactic.affected_squares && tactic.affected_squares.length > 0) {
                description += ` on squares ${tactic.affected_squares.join(", ")}`;
            }
            return description;
        }).join("\n");

        tacticalInstruction = `
TACTICAL OPPORTUNITY MISSED:
The User just played ${userMove.san}, but there was a better tactical opportunity available.
The analysis engine identified the following tactical themes that could have been exploited:

${tacticDescriptions}

IMPORTANT CONTEXT:
- This tactical data comes from analyzing what WOULD HAVE HAPPENED if the User had played the best move instead.
- You should explain this missed opportunity in your characteristic style.
- Point out what the User could have done (e.g., "You missed a fork with Nf3!" or "There was a pin available with Bb5!").
- Be educational but stay in character - if you're sarcastic, be sarcastic about the miss; if you're encouraging, be supportive.
- Do NOT mention "the engine" or "the computer" - present this as YOUR analysis as the opponent/tutor.
- Only mention this if the evaluation change was significant enough to warrant it.
        `;
    }

    const tempGameAfterUser = new Chess();
    tempGameAfterUser.loadPgn(game.pgn());
    tempGameAfterUser.undo();
    const fenAfterUserMove = tempGameAfterUser.fen();

    const tempGameBeforeUser = new Chess();
    tempGameBeforeUser.loadPgn(game.pgn());
    tempGameBeforeUser.undo();
    tempGameBeforeUser.undo();
    const fenBeforeUserMove = tempGameBeforeUser.fen();

    return `
[SYSTEM TRIGGER: move_exchange]
User (${playerColorName}) Move: ${userMove.san}
My (${tutorColorName}) Reply: ${computerMove.san}

Position Context:
- FEN before user's move: ${fenBeforeUserMove}
- FEN after user's move: ${fenAfterUserMove}
- FEN after my reply (current position): ${currentFen}

My Internal Thoughts (Data):
- Pre-Eval (Before User Move): ${preEvalStr}
- Post-Eval (After My Reply): ${postEvalStr}
${preMate === null && postMate === null ? `- Delta: ${delta} cp` : ""}
(Note: Scores are from White's perspective. Positive = White advantage, Negative = Black advantage. "Mate in X" means forced mate in X moves.)

${tacticalInstruction}

INSTRUCTIONS:
1. ${evalInstruction}
2. ${openingInstruction}
3. ${tacticalInstruction ? "If tactical opportunities were missed (see above), explain them in your style." : ""}
4. Use the FEN data above to understand exactly where all pieces are located on the board.
5. Respond in ${language}.

React to this exchange as the player.
    `;
}

export function buildMoveCommentaryPrompt(args: {
    bestMove: string;
    color: "white" | "black";
    cpLoss: number;
    evalAfter: number;
    evalBefore: number;
    fenAfter: string;
    fenBefore: string;
    mateInfo: string;
    moveNumber: number;
    openings: string;
    san: string;
    tactics: string;
}) {
    return `
Analyze this move:

DATA:
- Move number: ${args.moveNumber}
- Side to move: ${args.color}
- Move played (SAN): ${args.san}
- FEN before move: ${args.fenBefore}
- FEN after move: ${args.fenAfter}
- Evaluation before move: ${args.evalBefore.toFixed(2)} pawns
- Evaluation after move: ${args.evalAfter.toFixed(2)} pawns
- Best move suggestion: ${args.bestMove}
- Evaluation shift (centipawns): ${args.cpLoss}
- Possible Openings: ${args.openings}
- Missed tactics: ${args.tactics}
- Mate hint: ${args.mateInfo}

INSTRUCTIONS:
- Be concise (3-4 sentences).
- Mention whether the move improved or worsened the position and why.
- Highlight any tactical ideas the player may have missed.
- Refer to the player's side as ${args.color}.
- Keep it educational and stay true to your personality tone.`;
}

