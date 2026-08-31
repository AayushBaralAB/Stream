import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Head from 'next/head';
import { initMockApi } from '@/lib/mockApi';
import { withBase } from '@/lib/basePath';

if (typeof window !== 'undefined') {
  initMockApi();
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>AB Streaming Software</title>
        <meta name="description" content="Professional 24/7 streaming application designed by Aayush Baral" />
        <meta name="author" content="Aayush Baral" />
        <link rel="icon" href={withBase('/favicon.svg')} />
      </Head>
      <Component {...pageProps} />
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#262626',
            color: '#fafafa',
            border: '1px solid #404040',
          },
        }}
      />
    </>
  );
}