"use client";
import { useRef, useState } from "react";
import { useLive } from "@/hooks/use-live";
import { SiteHeader } from "./layout/site-header";
import { SiteFooter } from "./layout/site-footer";
import { Hero } from "./landing/hero";
import { HowItWorks } from "./landing/how-it-works";
import { ConversationPanel } from "./conversation/conversation-panel";
import { ConversationTranscript } from "./conversation/conversation-transcript";
import { DiscoveryResults } from "./catalogue/discovery-results";
import { InstrumentCollection } from "./catalogue/instrument-collection";
import { DebugPanel } from "./conversation/debug-panel";
import { VoiceSettings } from "./conversation/voice-settings";

export function InstrumentFinder() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const voice = useLive(audioRef);
  const [collectionOpen, setCollectionOpen] = useState(false);
  function exploreAgain() {
    void voice.restart();
  }
  return (
    <div className="app-shell">
      <audio ref={audioRef} autoPlay />
      <SiteHeader
        collectionOpen={collectionOpen}
        onToggleCollection={() => setCollectionOpen((open) => !open)}
      />
      <main>
        <Hero />
        <ConversationPanel voice={voice} />
        <DiscoveryResults
          selection={voice.selection}
          onExploreAgain={exploreAgain}
        />
        {voice.transcript.length > 0 && (
          <ConversationTranscript entries={voice.transcript} />
        )}
        {collectionOpen && (
          <InstrumentCollection onClose={() => setCollectionOpen(false)} />
        )}
        <HowItWorks />
      </main>
      <SiteFooter />
      <VoiceSettings voice={voice} />
      <DebugPanel voice={voice} />
    </div>
  );
}
