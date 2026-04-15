import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import type { FormSubmission, Contact } from "@shared/schema";

const TYPE_LABELS: Record<string, string> = {
  entreposage: "Entreposage",
  tri: "Informations globales du TRI",
  inspection: "Instructions d'inspection / Tri / Rework",
  copacking: "Bon de travail / Co-packing",
  livraison: "Formulaire de livraison",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  in_review: "En révision",
  approved: "Approuvé",
  completed: "Complété",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  submitted: "#3b82f6",
  in_review: "#f59e0b",
  approved: "#10b981",
  completed: "#8b5cf6",
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "12px", color: "#111827" }}>{value}</div>
    </div>
  );
}

function Tags({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: "10px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "999px", padding: "2px 8px", color: "#374151" }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
      color: "#ef5f18", borderBottom: "2px solid #ef5f18", paddingBottom: "4px",
      marginBottom: "12px", marginTop: "20px"
    }}>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 24px" }}>
      {children}
    </div>
  );
}

function FullRow({ children }: { children: React.ReactNode }) {
  return <div style={{ gridColumn: "1 / -1" }}>{children}</div>;
}

function FormBody({ form }: { form: FormSubmission }) {
  const data: any = form.data || {};

  if (form.formType === "entreposage") {
    const dims = [data.longueur, data.largeur, data.hauteur].filter(Boolean).join(" × ");
    return (
      <>
        <SectionHeader>A. Entreposage</SectionHeader>
        <Grid>
          <Field label="Nature du produit" value={data.natureProduit} />
          <Field label="Type d'emballage" value={data.typeEmballage || (data.hasBinRack ? "Bin/Rack" : undefined)} />
          <Field label="Dimensions" value={dims ? `${dims} ${data.uniteDimension || "cm"}` : undefined} />
          <Field label="Poids" value={data.poids ? `${data.poids} ${data.unitePoids || "kg"}` : undefined} />
          {data.typeEmballage === "Palette" && <>
            <Field label="Dimensions palette" value={data.paletteDimensions} />
            <Field label="Nb unités / palette" value={data.paletteNbUnites} />
            <Field label="Hauteur palette" value={data.paletteHauteur} />
            <Field label="Type palette" value={data.paletteType} />
          </>}
          {data.typeEmballage === "Boîte" && <>
            <Field label="Format boîte" value={data.boiteFormat} />
            <Field label="Nb unités / boîte" value={data.boiteNbUnites} />
          </>}
          {data.typeEmballage === "Vrac" && (
            <FullRow><Field label="Description vrac" value={data.vracDescription} /></FullRow>
          )}
          {data.typeEmballage === "Sac" && <>
            <Field label="Format sac" value={data.sacFormat} />
            <Field label="Nb unités / sac" value={data.sacNbUnites} />
          </>}
          {data.hasBinRack && <>
            <Field label="Taille Bin" value={data.binSize} />
            <Field label="Taille Rack" value={data.rackSize} />
          </>}
        </Grid>

        {data.hasLivraison && (
          <>
            <SectionHeader>B. Service de livraison</SectionHeader>
            <Grid>
              <Tags label="Type de marchandise" items={data.typeMarchandise} />
              <Field label="Destination" value={data.destinationType === "longue_distance" ? "Longue distance" : "Local"} />
              {data.destinationType === "longue_distance" && data.hasTailgate && <Field label="Tailgate" value="Requis" />}
              {data.hasRendezVous && <Field label="Rendez-vous" value={[data.rvDate, data.rvTime].filter(Boolean).join(" à ")} />}
              <Field label="Mode de facturation" value={data.modeBilling} />
              {data.adresses?.filter((a: any) => a.adresse).length > 0 && (
                <FullRow>
                  <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: "4px" }}>Adresse(s)</div>
                  {data.adresses.filter((a: any) => a.adresse).map((a: any, i: number) => (
                    <div key={i} style={{ fontSize: "12px", color: "#111827", marginBottom: "2px" }}>
                      {a.adresse}{a.notes ? <span style={{ color: "#6b7280" }}> — {a.notes}</span> : ""}
                    </div>
                  ))}
                </FullRow>
              )}
              <FullRow><Tags label="Documentation requise" items={data.documentation} /></FullRow>
              {data.hasConditionnement && <FullRow><Field label="Conditionnement" value={data.conditionnementDescription || "Requis"} /></FullRow>}
              {data.hasKitting && <FullRow><Field label="Kitting" value={data.kittingDescription || "Requis"} /></FullRow>}
            </Grid>
          </>
        )}

        {data.notes && (
          <>
            <SectionHeader>Notes</SectionHeader>
            <Field label="Notes additionnelles" value={data.notes} />
          </>
        )}
      </>
    );
  }

  if (form.formType === "tri") {
    const ncFilled = data.ncItems?.filter((i: any) => i.description) || [];
    const contactsFilled = data.contacts?.filter((c: any) => c.nom || c.email) || [];
    return (
      <>
        <SectionHeader>Identification</SectionHeader>
        <Grid>
          <Field label="Client" value={data.client} />
          <Field label="Sous-traitant" value={data.sousTraitant} />
          <Field label="Nom du projet" value={data.nomProjet} />
          <Field label="Code pièce" value={data.codePiece} />
          <Field label="N° instructions" value={data.instructionsNumero} />
          <Field label="Type TRI" value={data.typeTri} />
          <Field label="Langue échangée" value={data.langueEchangee} />
          {data.description && <FullRow><Field label="Description" value={data.description} /></FullRow>}
          <FullRow><Tags label="Références NC" items={data.ncReferences} /></FullRow>
        </Grid>

        {ncFilled.length > 0 && (
          <>
            <SectionHeader>Éléments NC ({ncFilled.length})</SectionHeader>
            {ncFilled.map((item: any, i: number) => (
              <div key={i} style={{ marginBottom: "8px", padding: "8px 12px", background: "#fef3c7", borderLeft: "3px solid #f59e0b", borderRadius: "4px" }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>NC {i + 1}</div>
                <div style={{ fontSize: "12px", color: "#111827" }}>{item.description}</div>
              </div>
            ))}
          </>
        )}

        <SectionHeader>Méthode de tri</SectionHeader>
        <Grid>
          <Field label="Méthode" value={data.methodeTri} />
          <Field label="Outils" value={data.outils} />
          <Field label="Unité / boîte" value={data.uniteParBoite} />
          <Field label="Besoin quotidien" value={data.besoinQuotidien} />
          <Field label="Cycle de tri" value={data.cycleTri ? `${data.cycleTri} (${data.cycleTriType || ""})` : undefined} />
        </Grid>

        {contactsFilled.length > 0 && (
          <>
            <SectionHeader>Contacts ({contactsFilled.length})</SectionHeader>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Nom", "Rôle", "Courriel"].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contactsFilled.map((c: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 500 }}>{c.nom || "—"}</td>
                    <td style={{ padding: "6px 10px", color: "#6b7280" }}>{c.role || "—"}</td>
                    <td style={{ padding: "6px 10px", color: "#6b7280" }}>{c.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </>
    );
  }

  if (form.formType === "inspection") {
    const criteriaFilled = data.criteria?.filter((c: any) => c.processTitle || c.processDescription) || [];
    return (
      <>
        <SectionHeader>En-tête</SectionHeader>
        <Grid>
          <Field label="Client" value={data.customer} />
          <Field label="Numéro de pièce" value={data.partNumber} />
          <Field label="Nom de pièce" value={data.partName} />
          <Field label="Révision" value={data.revision} />
          <Field label="Instruction de travail" value={data.workInstruction} />
          <Field label="Échantillon de contrôle" value={data.controlSample} />
          {data.controlSample === "custom" && <Field label="% personnalisé" value={data.customSamplePercent} />}
          <Field label="Outil de rework" value={data.reworkTool} />
          <Field label="Liste d'outils" value={data.toolList} />
          <Field label="Référence documentation" value={data.documentationReference} />
          <FullRow><Tags label="Méthode de contrôle" items={data.controlMethod} /></FullRow>
          <FullRow><Tags label="PPE requis" items={data.ppeOther ? [...(data.ppe || []), data.ppeOther] : (data.ppe || [])} /></FullRow>
          {data.inspectionDescription && <FullRow><Field label="Description inspection" value={data.inspectionDescription} /></FullRow>}
          {data.reworkDescription && <FullRow><Field label="Description rework" value={data.reworkDescription} /></FullRow>}
        </Grid>

        {criteriaFilled.length > 0 && (
          <>
            <SectionHeader>Critères d'inspection ({criteriaFilled.length})</SectionHeader>
            {criteriaFilled.map((c: any, i: number) => (
              <div key={i} style={{ marginBottom: "10px", border: "1px solid #e5e7eb", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ background: "#f9fafb", padding: "6px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#111827" }}>{c.processTitle || `Critère ${i + 1}`}</span>
                  <span style={{ fontSize: "9px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Critère {i + 1}</span>
                </div>
                <div style={{ padding: "8px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {c.processDescription && (
                    <div style={{ gridColumn: "1 / -1", fontSize: "11px", color: "#374151", marginBottom: "4px" }}>{c.processDescription}</div>
                  )}
                  {c.compliantDescription && (
                    <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "4px", padding: "6px 8px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#16a34a", marginBottom: "2px" }}>✓ CONFORME</div>
                      <div style={{ fontSize: "11px", color: "#166534" }}>{c.compliantDescription}</div>
                    </div>
                  )}
                  {c.nonCompliantDescription && (
                    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", padding: "6px 8px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#dc2626", marginBottom: "2px" }}>✗ NON CONFORME</div>
                      <div style={{ fontSize: "11px", color: "#991b1b" }}>{c.nonCompliantDescription}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {(data.approvalSystemeDName || data.approvalCustomerName) && (
          <>
            <SectionHeader>Approbations</SectionHeader>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {data.approvalSystemeDName && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Système-D</div>
                  <div style={{ fontSize: "12px", fontWeight: 600 }}>{data.approvalSystemeDName}</div>
                  {data.approvalSystemeDDate && <div style={{ fontSize: "11px", color: "#6b7280" }}>{data.approvalSystemeDDate}</div>}
                  <div style={{ marginTop: "14px", borderTop: "1px solid #e5e7eb", paddingTop: "6px", fontSize: "9px", color: "#9ca3af" }}>Signature</div>
                </div>
              )}
              {data.approvalCustomerName && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Client</div>
                  <div style={{ fontSize: "12px", fontWeight: 600 }}>{data.approvalCustomerName}</div>
                  {data.approvalCustomerDate && <div style={{ fontSize: "11px", color: "#6b7280" }}>{data.approvalCustomerDate}</div>}
                  <div style={{ marginTop: "14px", borderTop: "1px solid #e5e7eb", paddingTop: "6px", fontSize: "9px", color: "#9ca3af" }}>Signature</div>
                </div>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  if (form.formType === "copacking") {
    const workBlocksFilled = data.workBlocks?.filter((b: any) => b.description) || [];
    const packersFilled = data.packerRows?.filter((r: any) => r.nom) || [];
    const picksAvec = data.picksAvecFacture?.filter((r: any) => r.date) || [];
    const picksSans = data.picksSansFacture?.filter((r: any) => r.date) || [];
    return (
      <>
        <SectionHeader>En-tête</SectionHeader>
        <Grid>
          <Field label="Client" value={data.client} />
          <Field label="Projet" value={data.projet} />
          <Field label="Date bon de travail" value={data.dateBonTravail} />
          <Field label="Référence" value={data.reference} />
        </Grid>

        <SectionHeader>Palette & Matériaux</SectionHeader>
        <Grid>
          <Field label="Type palette" value={data.paletteType} />
          <Field label="Nb palettes" value={data.paletteNb} />
          <Field label="Matériaux disponibles" value={data.materiauxDisponible} />
          {data.materiauxDescription && <FullRow><Field label="Description matériaux" value={data.materiauxDescription} /></FullRow>}
        </Grid>

        <SectionHeader>Performance</SectionHeader>
        <Grid>
          <Field label="Qté totale" value={data.performanceQteTotal} />
          <Field label="Qté conforme" value={data.performanceQteConforme} />
          <Field label="Qté NC" value={data.performanceQteNC} />
        </Grid>

        {workBlocksFilled.length > 0 && (
          <>
            <SectionHeader>Blocs de travail ({workBlocksFilled.length})</SectionHeader>
            {workBlocksFilled.map((b: any, i: number) => (
              <div key={i} style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px", padding: "6px 10px", background: "#f9fafb", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                {b.description}
              </div>
            ))}
          </>
        )}

        {(picksAvec.length > 0 || picksSans.length > 0 || packersFilled.length > 0) && (
          <>
            <SectionHeader>Picks & Emballeurs</SectionHeader>
            <Grid>
              {picksAvec.length > 0 && <Field label="Picks avec facture" value={`${picksAvec.length} ligne(s)`} />}
              {picksSans.length > 0 && <Field label="Picks sans facture" value={`${picksSans.length} ligne(s)`} />}
              {packersFilled.length > 0 && <Field label="Emballeurs" value={`${packersFilled.length} personne(s)`} />}
            </Grid>
            {packersFilled.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginTop: "8px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Nom", "Date", "Début", "Fin", "Montages"].map((h) => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {packersFilled.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "5px 10px", fontWeight: 500 }}>{r.nom}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280" }}>{r.date || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280" }}>{r.debut || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280" }}>{r.fin || "—"}</td>
                      <td style={{ padding: "5px 10px", color: "#6b7280" }}>{r.montages || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {data.montageComments && (
          <>
            <SectionHeader>Commentaires</SectionHeader>
            <div style={{ fontSize: "12px", color: "#374151", padding: "10px 14px", background: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e7eb" }}>
              {data.montageComments}
            </div>
          </>
        )}
      </>
    );
  }

  if (form.formType === "livraison") {
    const destFilled = data.destinations?.filter((d: any) => d.adresse) || [];
    return (
      <>
        <SectionHeader>Marchandise</SectionHeader>
        <Grid>
          <Field label="Type de marchandise" value={data.typeMarchandise} />
          <Field label="Nb unités" value={data.nbUnites} />
          <Field label="Poids total" value={data.poidsTotal ? `${data.poidsTotal} ${data.unitePoids || "kg"}` : undefined} />
          <Field label="Référence" value={data.reference} />
        </Grid>

        <SectionHeader>Livraison</SectionHeader>
        <Grid>
          <Field label="Type destination" value={data.destinationType === "longue_distance" ? "Longue distance" : "Local"} />
          {data.hasTailgate && <Field label="Tailgate" value="Requis" />}
          {data.hasRendezVous && <Field label="Rendez-vous" value={[data.rvDate, data.rvTime].filter(Boolean).join(" à ")} />}
          <Field label="Mode de facturation" value={data.modeBilling} />
        </Grid>

        {destFilled.length > 0 && (
          <>
            <SectionHeader>Destinations ({destFilled.length})</SectionHeader>
            {destFilled.map((d: any, i: number) => (
              <div key={i} style={{ marginBottom: "8px", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 14px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{d.adresse}</div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  {d.contact && <span style={{ fontSize: "11px", color: "#6b7280" }}>Contact: {d.contact}</span>}
                  {d.telephone && <span style={{ fontSize: "11px", color: "#6b7280" }}>Tél: {d.telephone}</span>}
                  {d.notes && <span style={{ fontSize: "11px", color: "#6b7280" }}>{d.notes}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {data.documentation?.length > 0 && (
          <>
            <SectionHeader>Documentation requise</SectionHeader>
            <Tags label="" items={data.documentation} />
          </>
        )}

        {data.instructionsSpeciales && (
          <>
            <SectionHeader>Instructions spéciales</SectionHeader>
            <div style={{ fontSize: "12px", color: "#374151", padding: "10px 14px", background: "#fffbeb", borderRadius: "6px", border: "1px solid #fde68a" }}>
              {data.instructionsSpeciales}
            </div>
          </>
        )}
      </>
    );
  }

  return null;
}

export default function FormPrintPage({ id }: { id: number }) {
  const { data: form } = useQuery<FormSubmission>({
    queryKey: ["/api/forms", id],
    queryFn: () => fetch(`/api/forms/${id}`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: contacts } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const contact = contacts?.find((c) => c.id === form?.contactId);

  useEffect(() => {
    if (form) document.title = `${form.formNumber} — Système-D`;
    return () => { document.title = "Système-D"; };
  }, [form]);

  if (!form) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f9fafb" }}>
        <div style={{ color: "#6b7280", fontSize: "14px" }}>Chargement…</div>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[form.status] || "#6b7280";
  const dateStr = form.updatedAt
    ? new Date(form.updatedAt).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" })
    : new Date().toLocaleDateString("fr-CA");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; background: #e5e7eb; }

        .no-print { display: flex; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .page-wrap { box-shadow: none; margin: 0; }
        }
        @page { size: letter; margin: 0; }
      `}</style>

      {/* Print / nav bar */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        background: "#1a1a2e", padding: "10px 24px",
        alignItems: "center", justifyContent: "space-between", gap: "12px"
      }}>
        <button
          onClick={() => window.history.back()}
          style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}
        >
          <ArrowLeft size={14} />
          Retour
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Aperçu avant impression</span>
          <button
            onClick={() => window.print()}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              background: "#ef5f18", color: "white", border: "none",
              borderRadius: "6px", padding: "7px 16px", fontSize: "13px",
              fontWeight: 600, cursor: "pointer"
            }}
          >
            <Printer size={14} />
            Imprimer / Enregistrer PDF
          </button>
        </div>
      </div>

      {/* A4 page */}
      <div className="page-wrap" style={{
        width: "816px",
        margin: "60px auto 40px",
        background: "white",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        borderRadius: "4px",
        overflow: "hidden",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ background: "#1a1a2e", padding: "24px 40px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}>SYSTÈME-D</div>
            <div style={{ fontSize: "11px", color: "#6b7ca8", marginTop: "2px" }}>Entreposage & Logistique</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "white", fontFamily: "monospace", letterSpacing: "0.02em" }}>{form.formNumber}</div>
            <div style={{ display: "inline-flex", marginTop: "4px", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor, display: "inline-block" }} />
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>{STATUS_LABELS[form.status] || form.status}</span>
              <span style={{ fontSize: "11px", color: "#475569" }}>· Rév. {form.revision}</span>
            </div>
          </div>
        </div>

        {/* Orange accent stripe */}
        <div style={{ height: "4px", background: "linear-gradient(90deg, #ef5f18 0%, #f97316 50%, #fb923c 100%)" }} />

        {/* Meta bar */}
        <div style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "14px 40px", display: "flex", gap: "32px", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: "2px" }}>Type</div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{TYPE_LABELS[form.formType] || form.formType}</div>
          </div>
          {contact && (
            <div>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: "2px" }}>Client</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{contact.companyName || contact.name}</div>
              {contact.companyName && <div style={{ fontSize: "11px", color: "#64748b" }}>{contact.name}</div>}
            </div>
          )}
          <div>
            <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: "2px" }}>Date</div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{dateStr}</div>
          </div>
          {form.submittedByName && (
            <div>
              <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: "2px" }}>Soumis par</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>{form.submittedByName}</div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: "28px 40px 40px" }}>
          <FormBody form={form} />
        </div>

        {/* Footer */}
        <div style={{
          borderTop: "1px solid #e2e8f0", padding: "12px 40px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#f8fafc"
        }}>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>{form.formNumber} · Rév. {form.revision}</span>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>Système-D — Confidentiel</span>
          <span style={{ fontSize: "10px", color: "#94a3b8" }}>
            {new Date().toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    </>
  );
}
