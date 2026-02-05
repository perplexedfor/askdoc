import Chat from "@/components/Chat";

function GlobalChatPage() {
    // "ALL" is a reserved ID for the global chat context
    return (
        <div className="max-w-7xl mx-auto h-full p-5">
            <h1 className="text-3xl font-extralight text-indigo-600 mb-5">
                Chat with Knowledge Base
            </h1>

            <div className="h-[calc(100vh-200px)] flex flex-col bg-gray-100 rounded-lg lg:border-indigo-600 border-t-2">
                <Chat id="ALL" />
            </div>
        </div>
    )
}

export default GlobalChatPage;
