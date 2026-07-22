import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from "@google/generative-ai";

export const DEFAULT_MODEL_ID = process.env.NEXT_PUBLIC_GEMINI_MODEL_ID || "gemini-3.1-flash-lite-preview";

export async function getAvailableModels(apiKey?: string): Promise<string[]> {
    const fallbackModels = [
        "gemini-3.1-flash-lite-preview",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
        "gemini-1.0-pro"
    ];

    // Try to get API key from various sources
    const key = apiKey || 
                (typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") : null) || 
                process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!key || key === "your-api-key-here") {
        return fallbackModels;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        let result: any;

        // Check if running on Capacitor native platform
        const isNative = typeof window !== "undefined" && 
                          (window as any).Capacitor && 
                          (window as any).Capacitor.isNativePlatform && 
                          (window as any).Capacitor.isNativePlatform();

        if (isNative) {
            try {
                const { CapacitorHttp } = require("@capacitor/core");
                const response = await CapacitorHttp.get({ url });
                if (response.status === 200) {
                    result = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
                } else {
                    throw new Error(`CapacitorHttp failed with status ${response.status}`);
                }
            } catch (err) {
                console.error("CapacitorHttp error, trying fallback fetch:", err);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
                }
                result = await response.json();
            }
        } else {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
            }
            result = await response.json();
        }
        
        // Filter models that support content generation
        const models = (result.models || [])
            .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
            .map((m: any) => m.name.replace("models/", ""))
            // Filter out experimental or tuning models to keep the list clean
            .filter((name: string) => !name.includes("tunedModels/") && !name.startsWith("aqa"));
        
        if (models && models.length > 0) {
            return models.sort();
        }
    } catch (error) {
        console.error("Error fetching models from Gemini API:", error);
    }

    return fallbackModels;
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
