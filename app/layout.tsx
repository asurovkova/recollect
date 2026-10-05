import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Recollect — Your screenshot learning studio',description:'Turn the language you capture into contextual flashcards and quizzes.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
