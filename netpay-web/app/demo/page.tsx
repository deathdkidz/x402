'use client';

import { Web3Provider } from '../components/Web3Provider';
import DemoContent from './DemoContent';

export default function DemoPage() {
  return (
    <Web3Provider>
      <DemoContent />
    </Web3Provider>
  );
}
