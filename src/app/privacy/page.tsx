import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Footer from "@/components/Footer";

// Force dynamic rendering to read environment variables at runtime
export const dynamic = 'force-dynamic';

export default function PrivacyPage() {
    // Read environment variable at runtime (Server Component)
    const responsiblePerson = process.env.DATA_PRIVACY_RESPONSIBLE_PERSON || "[Name of Responsible Person]";

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
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        Privacy Policy
                    </div>
                </div>
            </div>

            <main className="flex-grow w-full flex justify-center px-4 py-8">
                <div className="w-full max-w-3xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 border border-gray-200 dark:border-gray-700 space-y-6 md:space-y-8">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Data Privacy Policy</h1>

                    <div className="prose dark:prose-invert max-w-none space-y-6 md:space-y-8">
                        <section>
                            <h2 className="text-lg md:text-xl font-semibold mb-3 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">1. Responsible Person</h2>
                            <p className="text-sm md:text-base text-gray-600 dark:text-gray-300">
                                Responsible for data processing according to GDPR:
                            </p>
                            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 font-mono text-xs md:text-sm text-blue-600 dark:text-blue-400">
                                {responsiblePerson}
                            </div>
                        </section>

                        <section>
                            <h2 className="text-lg md:text-xl font-semibold mb-3 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">2. Data Collection and Storage</h2>
                            <p className="text-sm md:text-base text-gray-600 dark:text-gray-300 leading-snug">
                                This application is designed to be privacy-friendly. We do not collect personal data on our servers.
                            </p>
                            <ul className="list-disc pl-5 mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
                                <li>
                                    <strong className="text-gray-900 dark:text-white">Local Storage:</strong> Your settings (language preference, API key) are stored locally in your browser&apos;s Local Storage. This data never leaves your device unless you explicitly send it (e.g., the API key is sent to Google&apos;s servers to generate AI responses).
                                </li>
                                <li>
                                    <strong className="text-gray-900 dark:text-white">Cookies:</strong> We do not use cookies for tracking or analytics.
                                </li>
                                <li>
                                    <strong className="text-gray-900 dark:text-white">Server Logs:</strong> We do not store personal information in server logs.
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-lg md:text-xl font-semibold mb-3 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 pb-2">3. Third-Party Services</h2>
                            <p className="text-sm md:text-base text-gray-600 dark:text-gray-300 leading-snug">
                                <strong className="text-gray-900 dark:text-white">Google Gemini API:</strong> When you use the AI Tutor feature, your game state (FEN string) and your API key are sent to Google&apos;s servers to generate the response. Please refer to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google&apos;s Privacy Policy</a> for more information on how they handle data.
                            </p>
                        </section>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
