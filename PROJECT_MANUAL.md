# AskDoc - Mini Knowledge-Base Assistant

## Introduction
AskDoc is a smart document assistant that allows users to upload PDF documents and ask questions about them. It uses **Retrieval-Augmented Generation (RAG)** to provide grounded, accurate answers with **citations** (e.g., `[Source: report.pdf, Page 5]`).

The system supports:
-   **Multi-File Chat**: Querying across all uploaded documents simultaneously.
-   **Single-File Chat**: Focused Q&A on a specific document.
-   **Strict Grounding**: Answers are derived *only* from the provided documents.

## Architecture

The system consists of two main pipelines: **Ingestion** and **Retrieval**.

### 1. Ingestion Pipeline (Upload & Indexing)
1.  **Upload**: User uploads a PDF via the Dashboard.
2.  **Storage**: 
    -   File binary is stored in **Supabase Storage** (or configured storage bucket).
    -   Metadata (URL, Name, Size) is stored in **Firebase Firestore**.
3.  **Processing**:
    -   The system fetches the PDF from the storage URL.
    -   **LangChain** loads the PDF and splits it into text chunks (2000 characters).
    -   **Metadata Extraction**: Each chunk is tagged with its `fileName`, `pageNumber`, and `docId`.
4.  **Embedding**:
    -   **Google Gemini (`text-embedding-004`)** converts text chunks into vector embeddings.
    -   Vectors are stored in **Pinecone** in a **Global Namespace** (`test-user-id`).

### 2. Retrieval Pipeline (Q&A)
1.  **Query Processing**: The user's question is rephrased by the AI to be standalone, using conversation history for context.
2.  **Vector Search**:
    -   The system searches Pinecone for the most similar text chunks.
    -   **Global Chat**: Searches the entire user namespace.
    -   **Specific Chat**: Applies a filter `{ docId: "target-id" }` to search only one file.
3.  **Context Assembly**: 
    -   Retrieved chunks are formatted as: `[Source: {filename}, Page {page}]: {content}`.
4.  **Generation**:
    -   **Google Gemini (`gemini-2.5-flash-lite`)** generates the answer.
    -   **System Prompt**: Enforces strict citation referencing using the provided metadata.

## Tech Stack

-   **Frontend**: Next.js 15 (React), Tailwind CSS.
-   **Backend/API**: Next.js Server Actions.
-   **Database**: Firebase Firestore (Metadata).
-   **Vector Database**: Pinecone.
-   **AI/LLM**: Google Gemini API (`gemini-2.5-flash-lite`, `text-embedding-004`).
-   **Orchestration**: LangChain.js.

## Setup Guide

### 1. Prerequisites
-   Node.js (v18+)
-   pnpm or npm
-   Accounts for: Firebase, Pinecone, Google Cloud (Vertex AI/Gemini).

### 2. Installation
```bash
git clone <repository-url>
cd askdoc
pnpm install
```

### 3. Environment Variables
Create a `.env.local` file with the following keys:

```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_key

# Pinecone Vector DB
PINECONE_API_KEY=your_pinecone_key

# Firebase Config (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin (Server)
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...

# Storage (Supabase/Other - tailored to current config)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 4. Running the App
```bash
pnpm run dev
```
Access the app at `http://localhost:3000`.

## Usage

1.  **Upload Documents**: Go to the Dashboard and upload PDF files. Wait for the "Generating Embeddings" step to complete.
2.  **Global Chat**: Click **"Chat with Knowledge Base"** on the dashboard to ask questions across all files.
3.  **Specific Chat**: Click on an individual file card to ask questions focused only on that document.
4.  **Verification**: Check the response for citations (e.g., `[Page 2]`) to verify the source of information.

## Notes
-   **Test Mode**: The app currently runs in "Test Mode" using a static `test-user-id`. Authentication (Clerk) is disabled for this development phase.
-   **Re-indexing**: If you change the embedding structure (e.g., adding new metadata fields), you must delete and re-upload files to regenerate their vectors.
