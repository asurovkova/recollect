import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Recollect — Language practice',description:'Practise language from your screenshots, with every question linked to its source.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
