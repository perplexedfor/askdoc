// import { auth} from "@clerk/nextjs/server";
import pineconeClient from "./pinecone";
import { Index, RecordMetadata } from "@pinecone-database/pinecone";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { PineconeStore } from "@langchain/pinecone";
import { adminDb } from "@/firebaseAdmin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not defined");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// Helper to list models (Temporary for debugging) - Removed
// async function listAvailableModels() { ... }

async function callGeminiWithRetry(prompt: string, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const geminiChat = chatModel.startChat();
      const result = await geminiChat.sendMessage(prompt);
      return result.response.text().trim();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes("429")) {
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded for Gemini API");
}

async function generateEmbeddings(text: string) {
  try {
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    return [];
  }
}

export const indexName = "askdoc";

async function fetchMessagesFromDB(docId: string) {
  const userId = "test-user-id";
  if (!userId) {
    throw new Error("User not found");
  }

  console.log("--- Fetching chat history from the database ---");
  const chats = await adminDb
    .collection('users')
    .doc(userId)
    .collection('files')
    .doc(docId)
    .collection('chat')
    .orderBy('createdAt', 'desc')
    .limit(5) // limit the chat history to upto 5 previous messages
    .get();

  const chatHistory = chats.docs.map((doc) =>
    doc.data().role === 'human'
      ? new HumanMessage(doc.data().message)
      : new AIMessage(doc.data().message)
  );

  console.log(`--- fetched last ${chatHistory.length} messages ---`);
  console.log(chatHistory.map((msg) => msg.content.toString()));

  return chatHistory;
}

// function sleep(ms: number) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

export async function generateDocs(docId: string) {
  // authenticate use
  const userId = "test-user-id";
  if (!userId) {
    throw new Error("User not found");
  }
  // fetch download URL from Firebase of file
  console.log("--- Fetching the downloaded URL from Firebase ---");
  const firebaseRef = await adminDb
    .collection("users")
    .doc(userId)
    .collection("files")
    .doc(docId)
    .get();
  const downloadUrl = firebaseRef.data()?.downloadUrl;
  const fileName = firebaseRef.data()?.name || "Unknown File";

  if (!downloadUrl) {
    throw new Error("Download URL not found");
  }

  // const token = await getToken({ template: 'supabase' })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not defined");
  }

  const fileUrl = `${supabaseUrl}/storage/v1/object/public/pdfs/${downloadUrl}`;

  console.log(`--- Fetching from: ${fileUrl} ---`);
  const response = await fetch(fileUrl, {
    headers: {
      // "Authorization": `Bearer ${token}`,
    }
  });

  if (!response.ok) {
    console.error("--- Error fetching PDF: ", response.status, response.statusText);
    const text = await response.text();
    console.error("--- Error body: ", text);
    throw new Error(`Failed to fetch PDF: ${response.statusText}`);
  }

  // Load the PDF into PDFDocument object
  const blobData = await response.blob();

  console.log("--- Content-Type:", response.headers.get("content-type"));
  console.log("--- Blob size:", blobData.size);

  const blob = new Blob([blobData], { type: 'application/pdf' });

  // Load the PDF document from the specified path
  console.log("--- Loading the PDF file ---");
  try {
    const loader = new PDFLoader(blob);
    const docs = await loader.load();

    // Split the loaded document into smaller parts for easier processing
    console.log("--- Splitting the document into smaller parts ---");
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 500,
    });
    const splitdocs = await splitter.splitDocuments(docs);

    // Attach metadata (filename, docId) to every chunk
    splitdocs.forEach((doc) => {
      doc.metadata = {
        ...doc.metadata,
        docId: docId,
        fileName: fileName,
      }
    })

    console.log(`--- Split into ${splitdocs.length} parts ---`);

    return splitdocs;
  } catch (error) {
    console.error("Error loading PDF:", error);
    throw new Error("Failed to load PDF due to invalid structure.");
  }
}

// async function namespaceExists(
//   index: Index<RecordMetadata>,
//   namespace: string
// ) {
//   console.log(`Checking for namespace: ${namespace}`);
//   try {
//     const stats = await index.describeIndexStats();
//     console.log("Existing namespaces:", Object.keys(stats.namespaces ?? {}));

//     return Object.keys(stats.namespaces ?? {}).includes(namespace);
//   } catch (error) {
//     console.error("Error checking namespace existence:", error);
//     return false;
//   }
// }

// class To use the asRetriever() function from LangChain, you need to create a PineconeStore object that wraps your Pinecone index and provides an embeddings interface.
class CustomPineconeEmbeddings implements EmbeddingsInterface {
  private index: Index<RecordMetadata>;
  private namespace: string;

  constructor(index: Index<RecordMetadata>, namespace: string) {
    this.index = index;
    this.namespace = namespace;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const embeddings = [];
    for (const document of documents) {
      const embedding = await generateEmbeddings(document);
      if (embedding) {
        embeddings.push(embedding);
      } else {
        console.error("Failed to generate embedding for:", document);
      }
    }
    return embeddings;
  }

  async embedQuery(query: string): Promise<number[]> {
    return await generateEmbeddings(query);
  }
}


export async function generateEmbeddingsInPineconeVectorStore(docId: string) {
  const userId = "test-user-id";
  if (!userId) {
    throw new Error("User not found");
  }

  const index = await pineconeClient.index(indexName);

  // Use a global namespace for the user
  const namespace = userId;

  // Check if this specific document already exists in the global namespace
  // We can't use describeIndexStats for checking individual file existence in a shared namespace easily
  // So we try a different check: list paginated? or check strictly for "ALL" mode.

  if (docId === "ALL") {
    console.log(`--- Returning vector store for ALL documents in namespace: ${namespace} ---`);
    const customEmbeddings = new CustomPineconeEmbeddings(index, namespace);
    return new PineconeStore(customEmbeddings, {
      pineconeIndex: index,
      namespace: namespace,
      textKey: 'text',
      // No filter means search everything
    });
  }

  // For specific docId, we want to ensure it's indexed.
  // Ideally, we check if vectors with metadata.docId === docId exist.
  // For simplicity/performance in this pattern: try to fetch the first chunk ID properly formatted
  // NOTE: This assumes we follow a consistent ID pattern: `${docId}-0`
  const firstChunkId = `${docId}-0`;
  const fetchResult = await index.namespace(namespace).fetch([firstChunkId]);
  const exists = fetchResult && fetchResult.records && fetchResult.records[firstChunkId];

  if (exists) {
    console.log(
      `--- Document ${docId} already exists in global namespace, reusing. ---`
    );

    const customEmbeddings = new CustomPineconeEmbeddings(index, namespace);
    return new PineconeStore(customEmbeddings, {
      pineconeIndex: index,
      namespace: namespace,
      textKey: "text",
      filter: { docId: { $eq: docId } }, // Filter by this document
    });
  } else {
    console.log("--- Generating embeddings... ---");
    const splitDocs = await generateDocs(docId);
    const chunks = splitDocs;

    // We upsert all chunks to the user's namespace
    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
      const batch = chunks[i];
      const text = batch.pageContent;
      const embedding = await generateEmbeddings(text); // existing helper

      if (!embedding) continue;

      // Use index 'i' to match the check `${docId}-${i}`? 
      // Current splitting logic produces `splitdocs`. Let's assume sequential ID `docId-i`.
      // Ensure we use the SAME ID pattern we check for: `docId-${index}`
      const vectorId = `${docId}-${i}`;

      vectors.push({
        id: vectorId,
        values: embedding,
        metadata: {
          text: text,
          docId: docId,
          fileName: batch.metadata.fileName,
          pageNumber: batch.metadata.loc.pageNumber,
        },
      });
    }

    console.log(`--- Batch upserting ${vectors.length} vectors ---`);
    // Pinecone recommends batches of 100 or so. For this demo, assuming small files.
    // If > 100, might need batching logic.
    await index.namespace(namespace).upsert(vectors);

    const customEmbeddings = new CustomPineconeEmbeddings(index, namespace);
    return new PineconeStore(customEmbeddings, {
      pineconeIndex: index,
      namespace: namespace,
      textKey: 'text',
      filter: { docId: { $eq: docId } },
    });
  }
}

const generateLangchainCompletion = async (docId: string, question: string) => {
  const pineconeVectorStore = await generateEmbeddingsInPineconeVectorStore(docId);

  if (!pineconeVectorStore) {
    throw new Error("Pinecone vector store not found");
  }

  // Fetch chat history from db
  const chatHistory = await fetchMessagesFromDB(docId);

  console.log("--- Creating a retriever ---");
  const retriever = pineconeVectorStore.asRetriever({
    searchType: "similarity",
    k: 30,
  });

  // Rephrase query based on chat history
  console.log("--- Rephrasing query based on chat history ---");
  const rephrasedQuery = await rephraseQueryWithHistory(question, chatHistory);

  // Retrieve relevant documents using the rephrased query
  console.log("--- Retrieving documents with rephrased query ---");
  let relevantDocuments = await retriever.invoke(rephrasedQuery);

  // // If no relevant documents found, fetch the entire document
  if (relevantDocuments.length === 0) {
    relevantDocuments = await generateDocs(docId);
  }

  // Generate completion based on the query and retrieved documents
  const completion = await generateGeminiCompletion(rephrasedQuery, relevantDocuments, chatHistory);

  return completion;
}

// Function to rephrase query using chat history
async function rephraseQueryWithHistory(question: string, chatHistory: (HumanMessage | AIMessage)[]) {
  // Convert chat history to a string format
  const historyString = chatHistory
    .map((msg) => `${msg instanceof HumanMessage ? "Human" : "AI"}: ${msg.content}`)
    .join("\n");

  // Create a prompt for Gemini to rephrase the query
  const prompt = `
    Given the following conversation history:
    ${historyString}
    
    And the latest user question:
    "${question}"
    
    Reformulate the question to be standalone and include all necessary context from the conversation history.
    Only output the reformulated question, nothing else.
  `;

  try {
    // Use Gemini to rephrase the query
    const rephrasedQuery = await callGeminiWithRetry(prompt);

    console.log("Original query:", question);
    console.log("Rephrased query:", rephrasedQuery);

    return rephrasedQuery;
  } catch (error) {
    console.error("Error rephrasing query:", error);
    return question; // Fallback to original question if rephrasing fails
  }
}

// Function to generate completion using Gemini
async function generateGeminiCompletion(question: string, documents: Document[], chatHistory: (HumanMessage | AIMessage)[]) {
  // Extract text from documents with updated format (Source + Page)
  const documentTexts = documents.map((doc) => {
    const pageNum = doc.metadata.pageNumber;
    const fileName = doc.metadata.fileName || "Unknown Source";
    return `[Source: ${fileName}, Page ${pageNum}]: ${doc.pageContent}`;
  }).join("\n\n");

  // Convert chat history to a string format for context
  const historyString = chatHistory
    .map((msg) => `${msg instanceof HumanMessage ? "Human" : "AI"}: ${msg.content}`)
    .join("\n");

  // Create a prompt for Gemini
  const prompt = `
    You are an AI assistant answering questions about documents.
    
    Conversation history:
    ${historyString}
    
    Context information from the documents:
    ${documentTexts}
    
    Based on the above context and conversation history, answer the following question.
    
    IMPORTANT:
    - You are a knowledge base assistant. 
    - Answer using ONLY the context provided above. 
    - You must cited your sources for every fact you state. 
    - Citations must be in the format [Source: Filename, Page X].
    - If the answer is not in the context, say you don't know.

    Question:
    "${question}"
  `;

  try {
    // Use Gemini to generate a response
    const responseText = await callGeminiWithRetry(prompt);
    return responseText;
  } catch (error) {
    console.error("Error generating completion:", error);
    return "I'm sorry, I encountered an error while generating a response.";
  }
};

// Export the model and the run function
export { model, generateLangchainCompletion };