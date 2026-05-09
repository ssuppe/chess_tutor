import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopUtilityLinks } from "@/components/TopUtilityLinks";
import Footer from "@/components/Footer";

// Force dynamic rendering to read environment variables at runtime
export const dynamic = 'force-dynamic';

export default async function ImprintPage() {
    // If external imprint URL is configured, redirect to it
    const imprintUrl = process.env.IMPRINT_URL;

    if (imprintUrl) {
        redirect(imprintUrl);
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {/* Slim Navigation Row */}
            <div className="w-full px-4 pt-2">
                <div className="max-w-3xl mx-auto flex justify-between items-center py-1">
                    <Link
                        href="/"
                        className="flex items-center gap-1.5 px-2 py-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-xs font-medium transition-all"
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">Back to Menu</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                            Imprint
                        </div>
                        <TopUtilityLinks language="en" />
                    </div>
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-8">
                <div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700 space-y-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Imprint</h1>

                    <div className="prose dark:prose-invert max-w-none">
                        <div className="p-4 md:p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700">
                            <p className="text-sm md:text-base text-gray-600 dark:text-gray-300">
                                Currently no imprint information is available.
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
