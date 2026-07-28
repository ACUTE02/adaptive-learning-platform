import { AITutorWidget } from "@components/AITutorWidget";

export default function SniperModePage() {
  return (
    <div className="h-full w-full bg-[#f8f8f8] dark:bg-zinc-950 flex flex-col items-center justify-start pt-12 p-8 overflow-y-auto">
      <div className="w-full max-w-3xl text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-3 tracking-tight">
          Sniper Mode
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Target your weakest concepts with the AI Engine.
        </p>
      </div>
      
      <div className="w-full max-w-5xl">
        <AITutorWidget />
      </div>
    </div>
  )
}
