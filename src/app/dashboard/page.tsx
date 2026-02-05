import Documents from "@/components/Documents";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";


function Dashboard() {
  return (
    <div className="h-full max-w-7xl mx-auto">
      <div className="flex justify-between items-center p-5 bg-gray-100 border-b">
        <h1 className="text-3xl font-extralight text-indigo-600">My Documents</h1>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700">
          <Link href="/dashboard/chat">Chat with Knowledge Base</Link>
        </Button>
      </div>
      <Documents />
    </div>
  )
}

export default Dashboard
