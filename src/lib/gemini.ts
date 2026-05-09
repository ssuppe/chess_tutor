import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from "@google/generative-ai";

export const DEFAULT_MODEL_ID = process.env.NEXT_PUBLIC_GEMINI_MODEL_ID || "gemini-3.1-flash-lite-preview";

export async function getAvailableModels(): Promise<string[]> {
    return [
        "gemini-3.1-flash-lite-preview",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];
}

/**
 * Resolves the Gemini model ID to use.
 * Order of precedence: 
 * 1. Explicitly provided modelName
 * 2. localStorage (user preference)
 * 3. Environment variable
 * 4. Default constant
 */
export function resolveModelId(explicitModelName?: string): string {
    if (explicitModelName) return explicitModelName;

    if (typeof window !== "undefined") {
        const savedModel = localStorage.getItem("gemini_model_id");
        if (savedModel) return savedModel;
    }

    return DEFAULT_MODEL_ID;
}

const evaluatePositionTool: FunctionDeclaration = {
    name: "evaluate_position",
    description: "Evaluates a chess position using the Stockfish engine to get the best move and score. Use this when the user asks for the best move, evaluation, or why a move is good/bad.",
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            fen: {
                type: SchemaType.STRING,
                description: "The FEN string of the position to evaluate.",
            },
            depth: {
                type: SchemaType.NUMBER,
                description: "The search depth for the engine (default 15).",
            },
        },
        required: ["fen"],
    },
};

export function getGenAIModel(apiKey: string, modelName?: string) {
    const resolvedModel = resolveModelId(modelName);
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
        model: resolvedModel,
        tools: [{ functionDeclarations: [evaluatePositionTool] }],
    });
}
