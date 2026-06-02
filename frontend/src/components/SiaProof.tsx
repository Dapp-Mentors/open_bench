import { Database, ExternalLink } from "lucide-react";

interface Props {
  siaHash?: string | null;
  indexdKey?: string | null;
}

export function SiaProof({ siaHash, indexdKey }: Props) {
  if (!siaHash) return null;

  return (
    <div
      className="rounded-lg p-4 border"
      style={{
        background: "rgba(0,188,212,0.04)",
        borderColor: "rgba(0,188,212,0.2)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4" style={{ color: "var(--cyan)" }} />
        <span className="font-mono text-xs font-semibold" style={{ color: "var(--cyan)" }}>
          SIA NETWORK PROOF
        </span>
      </div>
      <div className="space-y-2">
        {siaHash && (
          <div>
            <div className="section-label mb-1">Skylink Hash</div>
            <div
              className="font-mono text-xs break-all py-1.5 px-2 rounded"
              style={{
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              {siaHash}
            </div>
          </div>
        )}
        {indexdKey && (
          <div>
            <div className="section-label mb-1">Indexd Key</div>
            <div
              className="font-mono text-xs py-1.5 px-2 rounded"
              style={{
                background: "var(--surface)",
                color: "var(--subtle)",
                border: "1px solid var(--border)",
              }}
            >
              {indexdKey}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
