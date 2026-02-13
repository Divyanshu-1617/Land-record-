import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const getClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API_KEY not found in environment variables");
    }
    return new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });
};

export const analyzeLandImage = async (base64Image: string, promptText: string): Promise<AnalysisResult | null> => {
    try {
        const ai = getClient();
        
        // Using gemini-3-flash-preview for multimodal analysis with JSON output
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Image
                        }
                    },
                    {
                        text: `Analyze this satellite/aerial view of land. 
                        ${promptText}
                        Provide the output in JSON format with the following schema:
                        - suitabilityScore (0-100 number)
                        - landUse (string, e.g., "Agricultural", "Urban", "Forest")
                        - cropRecommendations (array of strings, suggest 3 suitable crops if agricultural, else N/A)
                        - risks (array of strings, e.g., "Flood risk", "Erosion")
                        - soilTypeEstimation (string)
                        - summary (string, max 50 words)`
                    }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suitabilityScore: { type: Type.NUMBER },
                        landUse: { type: Type.STRING },
                        cropRecommendations: { 
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        risks: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        soilTypeEstimation: { type: Type.STRING },
                        summary: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) return null;
        
        return JSON.parse(text) as AnalysisResult;

    } catch (error) {
        console.error("Error analyzing land image:", error);
        return {
            suitabilityScore: 0,
            landUse: "Error",
            cropRecommendations: [],
            risks: ["Analysis Failed"],
            soilTypeEstimation: "Unknown",
            summary: "Failed to generate analysis. Please check your API key and try again."
        };
    }
};

export const getGeneralInsights = async (query: string): Promise<string> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: query,
        });
        return response.text || "No insights available.";
    } catch (error) {
        console.error("Error getting insights:", error);
        return "Unable to retrieve insights at this time.";
    }
}