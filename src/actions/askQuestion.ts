'use server'

import { Message } from "@/components/Chat";
import { adminDb } from "@/firebaseAdmin";
import { generateLangchainCompletion } from "@/lib/langchain";
// import { auth } from "@clerk/nextjs/server";
// import { generateLangchainCompletion } from "../lib/langchain";

// const FREE_LIMIT = 5;
// const  PRO_LIMIT = 100;

export async function askQuestion(id: string, question: string) {
    const userId = "test-user-id";
    if (!userId) {
        throw new Error("User not found");
    }

    const chatRef = adminDb
        .collection("users")
        .doc(userId)
        .collection("files")
        .doc(id)
        .collection("chat")

    // NOTE: For "ALL" queries, we might want to store chat in a general "chat" collection under users/{userId}/chat
    // For now, we reuse the existing structure. If id is "ALL", we might need a dummy document or a different path.
    // However, the dashboard UI links to specific files. 
    // If we implement a global chat UI, we should probably pass a special ID like "global-chat".
    // Let's assume for now this function is used for specific files OR "ALL" passed from a new UI component.


    //  limit the PRO/FREE users

    const userMessage: Message = {
        role: "human",
        message: question,
        createdAt: new Date(),
    }

    await chatRef.add(userMessage);

    // Generate AI response
    const reply = await generateLangchainCompletion(id, question);
    if (typeof reply === 'string') {
        const aiMessage: Message = {
            role: "ai",
            message: reply,
            createdAt: new Date(),
        };
        await chatRef.add(aiMessage);
        return { success: true, message: reply };
    } else {
        console.error("Unexpected response from generateLangchainCompletion:", reply);
        return { success: false, message: "An error occurred while generating the response." };
    }

    // await chatRef.add(aiMessage);

    // return { success: true, message: reply };
}