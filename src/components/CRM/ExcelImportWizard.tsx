import React, { useState } from 'react';
import { Project } from '../../types/models.ts';
import { api } from '../../services/api.ts';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowRight, Settings, RefreshCw, Copy, HelpCircle, Check, Info } from 'lucide-react';

interface ExcelImportWizardProps {
  project: Project;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ExcelImportWizard: React.FC<ExcelImportWizardProps> = ({
  project,
  onClose,
  onImportComplete
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [preview, setPreview] = useState<any | null>(null);
  const [showMappingEditor, setShowMappingEditor] = useState(false);
  const [customMapping, setCustomMapping] = useState<Record<string, number>>({});
  const [availableHeaders, setAvailableHeaders] = useState<{ header: string; colIndex: number }[]>([]);
  const [identifierCandidates, setIdentifierCandidates] = useState<any[]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(1);
  const [requiresManualMapping, setRequiresManualMapping] = useState(false);
  const [manualMappingPrompt, setManualMappingPrompt] = useState('');
  
  const [skipInvalidRows, setSkipInvalidRows] = useState(false);
  const [rowActions, setRowActions] = useState<Record<number, { action: 'SKIP' | 'SET_STATUS' | 'KEEP' | 'EXCLUDE'; status?: string }>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setErrorMsg('');
    setRequiresManualMapping(false);
    setManualMappingPrompt('');
    setIsLoading(true);

    try {
      const res = await api.uploadExcelForSheets(selected);
      setSheets(res.sheets || []);
      
      // Auto-select sheet matching project name if possible
      const matchingSheet = (res.sheets || []).find((s: string) => 
        s.toLowerCase().includes(project.name.toLowerCase().replace('nova ', ''))
      ) || res.sheets?.[0] || '';
      
      setSelectedSheet(matchingSheet);
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to inspect Excel workbook.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePreview = async (mappingOverrides?: Record<string, number>) => {
    if (!file || !selectedSheet) return;

    setIsLoading(true);
    setErrorMsg('');

    const mappingToUse = mappingOverrides !== undefined ? mappingOverrides : customMapping;

    try {
      const previewData = await api.generateExcelPreview(
        file, 
        project.id, 
        selectedSheet,
        Object.keys(mappingToUse).length > 0 ? mappingToUse : undefined
      );

      setPreview(previewData);
      setRowActions({});
      setRequiresManualMapping(false);
      setManualMappingPrompt('');

      if (previewData.availableHeaders) {
        setAvailableHeaders(previewData.availableHeaders);
      }
      if (previewData.identifierCandidates) {
        setIdentifierCandidates(previewData.identifierCandidates);
      }
      if (previewData.headerRowIndex) {
        setHeaderRowIdx(previewData.headerRowIndex);
      }

      // Initialize custom mapping state from detected mappings if not yet set
      if (previewData.detectedMapping) {
        const initialMap: Record<string, number> = {};
        previewData.detectedMapping.forEach((m: any) => {
          if (m.targetField && m.targetField !== 'unmapped') {
            if (m.targetField === 'propertyNumber') initialMap.propNumberIdx = m.colIndex;
            else if (m.targetField === 'areaSqft') initialMap.areaIdx = m.colIndex;
            else if (m.targetField === 'facing') initialMap.facingIdx = m.colIndex;
            else if (m.targetField === 'status') initialMap.statusIdx = m.colIndex;
            else if (m.targetField === 'sectionOrPhase') initialMap.sectionIdx = m.colIndex;
            else if (m.targetField === 'unitType') initialMap.unitTypeIdx = m.colIndex;
            else if (m.targetField === 'plinthArea') initialMap.plinthIdx = m.colIndex;
            else if (m.targetField === 'commonArea') initialMap.commonIdx = m.colIndex;
            else if (m.targetField === 'uds') initialMap.udsIdx = m.colIndex;
          }
        });
        setCustomMapping(prev => ({ ...initialMap, ...prev, ...(mappingOverrides || {}) }));
      }

      // If multiple identifier candidates detected, gently open editor for verification
      if (previewData.hasMultipleCandidates) {
        setShowMappingEditor(true);
      }

      setStep(3);
    } catch (err: any) {
      if (err.requiresMapping || err.availableHeaders?.length > 0 || err.message?.includes("couldn't confidently identify")) {
        setRequiresManualMapping(true);
        setManualMappingPrompt(err.message || "We couldn't confidently identify the property identifier column. Please select the correct column.");
        if (err.availableHeaders) setAvailableHeaders(err.availableHeaders);
        if (err.identifierCandidates) setIdentifierCandidates(err.identifierCandidates);
        setErrorMsg('');
      } else {
        setErrorMsg(err.message || 'Failed to parse Excel rows.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyImport = async () => {
    if (!preview?.importId) return;

    setIsApplying(true);
    setErrorMsg('');

    try {
      const res = await api.applyExcelImport(preview.importId, {
        skipInvalid: skipInvalidRows,
        rowActions
      });
      alert(res.message || 'Import applied successfully.');
      onImportComplete();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to apply import.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '920px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <FileSpreadsheet size={20} color="var(--brand-gold)" />
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0 }}>
              Excel Inventory Importer & Governance Pipeline
            </h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', whiteSpace: 'pre-line' }}>
              {errorMsg}
            </div>
          )}

          {/* Stepper Header */}
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 1 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>1. Upload File</span>
            </div>
            <ArrowRight size={14} color="var(--text-muted)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 2 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>2. Select Sheet & Column Mapping</span>
            </div>
            <ArrowRight size={14} color="var(--text-muted)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: step >= 3 ? 'var(--brand-gold)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>
              <span>3. Preview & Apply</span>
            </div>
          </div>

          {/* STEP 1: Upload */}
          {step === 1 && (
            <div style={{ border: '2px dashed var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-surface-raised)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <UploadCloud size={48} color="var(--brand-gold)" />
              <div>
                <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.35rem' }}>Upload Inventory Excel Workbook</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Supports .xlsx, .xls files with multiple project sheets
                </p>
              </div>

              <label className="btn btn-primary" style={{ cursor: 'pointer', marginTop: '0.5rem' }}>
                <FileSpreadsheet size={16} /> Choose Excel File
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {/* STEP 2: Select Sheet & Initial Header Review */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'var(--bg-surface-raised)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Project</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{project.name} ({project.project_type})</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Select Sheet from Workbook ({sheets.length} sheets found)
                </label>
                <select
                  value={selectedSheet}
                  onChange={e => {
                    setSelectedSheet(e.target.value);
                    setRequiresManualMapping(false);
                    setCustomMapping({});
                  }}
                  style={{ width: '100%', padding: '0.75rem' }}
                >
                  {sheets.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Manual Mapping Card if automatic detection was uncertain or user needs to map */}
              {requiresManualMapping && (
                <div style={{ background: 'rgba(212, 175, 55, 0.08)', border: '1.5px solid rgba(212, 175, 55, 0.4)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                    <AlertCircle size={20} color="var(--brand-gold)" />
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                        Property Identifier Selection Required
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {manualMappingPrompt || "We couldn't confidently identify the property identifier column. Please select the correct column."}
                      </div>
                    </div>
                  </div>

                  {identifierCandidates.length > 0 && (
                    <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.25)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-xs)' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--brand-gold)', fontWeight: 600, marginBottom: '0.4rem' }}>
                        Detected Candidate Columns:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {identifierCandidates.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`btn btn-sm ${customMapping.propNumberIdx === c.colIndex ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ fontSize: '0.78rem' }}
                            onClick={() => setCustomMapping(prev => ({ ...prev, propNumberIdx: c.colIndex }))}
                          >
                            {c.isRecommended ? '★ ' : ''}{c.header} ({c.reason})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: '0.35rem' }}>
                        Property Identifier (Plot / Flat / Unit #) *
                      </label>
                      <select
                        value={customMapping.propNumberIdx !== undefined ? customMapping.propNumberIdx : ''}
                        onChange={e => setCustomMapping(prev => ({ ...prev, propNumberIdx: parseInt(e.target.value, 10) }))}
                        style={{ width: '100%', padding: '0.6rem' }}
                      >
                        <option value="">-- Choose Identifier Column --</option>
                        {availableHeaders.map(h => (
                          <option key={h.colIndex} value={h.colIndex}>
                            Col {h.colIndex + 1}: {h.header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Status Column (Optional)
                      </label>
                      <select
                        value={customMapping.statusIdx !== undefined ? customMapping.statusIdx : ''}
                        onChange={e => setCustomMapping(prev => ({ ...prev, statusIdx: e.target.value === '' ? -1 : parseInt(e.target.value, 10) }))}
                        style={{ width: '100%', padding: '0.6rem' }}
                      >
                        <option value="">Auto-Detect / Default (Available)</option>
                        {availableHeaders.map(h => (
                          <option key={h.colIndex} value={h.colIndex}>
                            Col {h.colIndex + 1}: {h.header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Area / Sq.Ft Column (Optional)
                      </label>
                      <select
                        value={customMapping.areaIdx !== undefined ? customMapping.areaIdx : ''}
                        onChange={e => setCustomMapping(prev => ({ ...prev, areaIdx: e.target.value === '' ? -1 : parseInt(e.target.value, 10) }))}
                        style={{ width: '100%', padding: '0.6rem' }}
                      >
                        <option value="">Auto-Detect</option>
                        {availableHeaders.map(h => (
                          <option key={h.colIndex} value={h.colIndex}>
                            Col {h.colIndex + 1}: {h.header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: '#fff', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Facing Column (Optional)
                      </label>
                      <select
                        value={customMapping.facingIdx !== undefined ? customMapping.facingIdx : ''}
                        onChange={e => setCustomMapping(prev => ({ ...prev, facingIdx: e.target.value === '' ? -1 : parseInt(e.target.value, 10) }))}
                        style={{ width: '100%', padding: '0.6rem' }}
                      >
                        <option value="">Auto-Detect</option>
                        {availableHeaders.map(h => (
                          <option key={h.colIndex} value={h.colIndex}>
                            Col {h.colIndex + 1}: {h.header}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleGeneratePreview()} 
                  disabled={isLoading || !selectedSheet || (requiresManualMapping && customMapping.propNumberIdx === undefined)}
                >
                  {isLoading ? 'Inspecting Rows...' : 'Generate Diff Preview'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview & Apply */}
          {step === 3 && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Column Mapping Preview & Interactive Mapping Editor */}
              <div style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                      Column Mapping (Header Row {preview.headerRowIndex || headerRowIdx || 1})
                    </span>
                    {preview.isIdentifierConfident && (
                      <span className="badge badge-available" style={{ fontSize: '0.68rem' }}>
                        ✓ Identifier Detected
                      </span>
                    )}
                    {preview.hasMultipleCandidates && (
                      <span className="badge badge-booked" style={{ fontSize: '0.68rem' }}>
                        Multiple Candidates Detected
                      </span>
                    )}
                  </div>
                  <button 
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    onClick={() => setShowMappingEditor(!showMappingEditor)}
                  >
                    <Settings size={12} /> {showMappingEditor ? 'Hide Mapping Editor' : 'Review / Edit Mapping'}
                  </button>
                </div>

                {/* Expanded Interactive Mapping Editor */}
                {showMappingEditor ? (
                  <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {identifierCandidates.length > 0 && (
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 600, marginBottom: '0.3rem' }}>
                          Detected Property Identifier Candidates:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {identifierCandidates.map((c, idx) => (
                            <span 
                              key={idx}
                              style={{ 
                                fontSize: '0.72rem', 
                                padding: '0.2rem 0.5rem', 
                                borderRadius: '3px',
                                background: customMapping.propNumberIdx === c.colIndex ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${customMapping.propNumberIdx === c.colIndex ? 'var(--status-available)' : 'var(--border-subtle)'}`,
                                color: customMapping.propNumberIdx === c.colIndex ? 'var(--status-available)' : '#fff'
                              }}
                            >
                              <strong>{c.header}</strong> (Col {c.colIndex + 1}) — {c.reason} {c.isRecommended ? '★ Recommended' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      {/* Property Identifier Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--brand-gold)', fontWeight: 700, marginBottom: '0.25rem' }}>
                          Property Identifier *
                        </label>
                        <select
                          value={customMapping.propNumberIdx !== undefined ? customMapping.propNumberIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'propertyNumber')?.colIndex ?? '')}
                          onChange={e => setCustomMapping(prev => ({ ...prev, propNumberIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Status Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Status
                        </label>
                        <select
                          value={customMapping.statusIdx !== undefined ? customMapping.statusIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'status')?.colIndex ?? -1)}
                          onChange={e => setCustomMapping(prev => ({ ...prev, statusIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          <option value="-1">None (Default Available)</option>
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Area Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Area (sq.ft)
                        </label>
                        <select
                          value={customMapping.areaIdx !== undefined ? customMapping.areaIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'areaSqft')?.colIndex ?? -1)}
                          onChange={e => setCustomMapping(prev => ({ ...prev, areaIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          <option value="-1">None</option>
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Facing Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Facing
                        </label>
                        <select
                          value={customMapping.facingIdx !== undefined ? customMapping.facingIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'facing')?.colIndex ?? -1)}
                          onChange={e => setCustomMapping(prev => ({ ...prev, facingIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          <option value="-1">None</option>
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section / Phase Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Phase / Section
                        </label>
                        <select
                          value={customMapping.sectionIdx !== undefined ? customMapping.sectionIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'sectionOrPhase')?.colIndex ?? -1)}
                          onChange={e => setCustomMapping(prev => ({ ...prev, sectionIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          <option value="-1">None</option>
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Unit Type Dropdown */}
                      <div style={{ background: 'var(--bg-surface)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: '#fff', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Unit Type / BHK
                        </label>
                        <select
                          value={customMapping.unitTypeIdx !== undefined ? customMapping.unitTypeIdx : (preview.detectedMapping?.find((m: any) => m.targetField === 'unitType')?.colIndex ?? -1)}
                          onChange={e => setCustomMapping(prev => ({ ...prev, unitTypeIdx: parseInt(e.target.value, 10) }))}
                          style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                        >
                          <option value="-1">None</option>
                          {(preview.availableHeaders || availableHeaders).map((h: any) => (
                            <option key={h.colIndex} value={h.colIndex}>
                              Col {h.colIndex + 1}: {h.header}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => handleGeneratePreview(customMapping)}
                        disabled={isLoading}
                      >
                        <RefreshCw size={12} /> {isLoading ? 'Updating Preview...' : 'Update Mapping & Refresh Preview'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.75rem' }}>
                    {preview.detectedMapping?.map((m: any, idx: number) => (
                      <span key={idx} style={{ background: 'var(--bg-surface)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: '#fff' }}>{m.excelHeader}</strong> → <span style={{ color: 'var(--brand-gold)' }}>{m.targetField}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Invalid Rows Action Card */}
              {preview.summary.invalidCount > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1.5px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <AlertCircle size={20} color="#ef4444" />
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ef4444' }}>
                          Action Required: {preview.summary.invalidCount} Row(s) Contain Unsupported Statuses / Values
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          For example, on-site reservations like "Clubhouse" cannot be directly recorded as sale inventory. You can skip these rows or map their status below.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`btn btn-sm ${skipInvalidRows ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => setSkipInvalidRows(!skipInvalidRows)}
                      >
                        {skipInvalidRows ? '✓ Skipping Invalid Rows' : 'Skip All Invalid Rows'}
                      </button>
                    </div>
                  </div>

                  {/* List of specific invalid rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {preview.rows.filter((r: any) => r.changeType === 'INVALID').map((inv: any, idx: number) => {
                      const detail = inv.errorDetails;
                      const action = rowActions[inv.rowIndex];

                      return (
                        <div key={idx} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                              Row {inv.rowIndex}: Plot {inv.propertyNumber} • Column: {detail?.excelColumn || 'Status'} • Value: <code style={{ color: '#ef4444' }}>"{detail?.originalValue || inv.status}"</code>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                              {detail?.problem || inv.validationError} ({detail?.possibleCause})
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <select
                              value={action?.action === 'SET_STATUS' ? action.status : (action?.action === 'SKIP' ? 'SKIP' : '')}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'SKIP') {
                                  setRowActions(prev => ({ ...prev, [inv.rowIndex]: { action: 'SKIP' } }));
                                } else if (val) {
                                  setRowActions(prev => ({ ...prev, [inv.rowIndex]: { action: 'SET_STATUS', status: val } }));
                                } else {
                                  const copy = { ...rowActions };
                                  delete copy[inv.rowIndex];
                                  setRowActions(copy);
                                }
                              }}
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem', background: 'var(--bg-surface-raised)', color: '#fff' }}
                            >
                              <option value="">Choose Action...</option>
                              <option value="SKIP">Skip This Row</option>
                              <option value="RESERVED">Map Status to: RESERVED</option>
                              <option value="BLOCKED">Map Status to: BLOCKED</option>
                              <option value="AVAILABLE">Map Status to: AVAILABLE</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Duplicate Rows Review Card (Governance Pipeline) */}
              {preview.summary.duplicateCount > 0 && (
                <div style={{ background: 'rgba(212, 175, 55, 0.08)', border: '1.5px solid rgba(212, 175, 55, 0.35)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Copy size={20} color="var(--brand-gold)" />
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                          Duplicate Review Required: {preview.summary.duplicateCount} Potential Duplicate Row(s) Detected
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          These rows share identical identifiers with prior rows in this spreadsheet. Review each row below to keep legitimate units or exclude unintended duplicates.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem', color: 'var(--status-available)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                        onClick={() => {
                          const updated = { ...rowActions };
                          preview.rows.filter((r: any) => r.changeType === 'DUPLICATE').forEach((r: any) => {
                            updated[r.rowIndex] = { action: 'KEEP' };
                          });
                          setRowActions(updated);
                        }}
                      >
                        ✓ Keep All Duplicates
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
                        onClick={() => {
                          const updated = { ...rowActions };
                          preview.rows.filter((r: any) => r.changeType === 'DUPLICATE').forEach((r: any) => {
                            updated[r.rowIndex] = { action: 'EXCLUDE' };
                          });
                          setRowActions(updated);
                        }}
                      >
                        Exclude All Duplicates
                      </button>
                    </div>
                  </div>

                  {/* List of specific duplicate rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.75rem', maxHeight: '240px', overflowY: 'auto' }}>
                    {preview.rows.filter((r: any) => r.changeType === 'DUPLICATE').map((dup: any, idx: number) => {
                      const action = rowActions[dup.rowIndex];
                      const isKept = action?.action === 'KEEP';
                      const isExcluded = action?.action === 'EXCLUDE' || (!action && !isKept);
                      const detail = dup.duplicateDetails;

                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            background: isKept ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0,0,0,0.35)', 
                            padding: '0.75rem 1rem', 
                            borderRadius: 'var(--radius-sm)', 
                            border: `1px solid ${isKept ? 'rgba(16, 185, 129, 0.4)' : 'rgba(212, 175, 55, 0.25)'}`, 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            flexWrap: 'wrap', 
                            gap: '0.75rem' 
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>Row {dup.rowIndex}: Plot {dup.propertyNumber}</span>
                              {dup.sectionOrPhase && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--brand-gold)', background: 'rgba(212, 175, 55, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                                  {dup.sectionOrPhase}
                                </span>
                              )}
                              <span className={`badge badge-${dup.status.toLowerCase()}`} style={{ fontSize: '0.68rem' }}>
                                {dup.status}
                              </span>
                              {dup.areaSqft && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                  {dup.areaSqft} sq.ft
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              {detail?.reason || dup.validationError}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              className={`btn btn-sm ${isKept ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
                              onClick={() => setRowActions(prev => ({ ...prev, [dup.rowIndex]: { action: 'KEEP' } }))}
                            >
                              {isKept ? '✓ Kept in Import' : 'Keep Row'}
                            </button>
                            <button
                              className={`btn btn-sm ${isExcluded && action?.action === 'EXCLUDE' ? 'btn-danger' : 'btn-secondary'}`}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem', color: isExcluded && action?.action === 'EXCLUDE' ? '#ef4444' : 'var(--text-muted)' }}
                              onClick={() => setRowActions(prev => ({ ...prev, [dup.rowIndex]: { action: 'EXCLUDE' } }))}
                            >
                              {isExcluded && action?.action === 'EXCLUDE' ? 'Excluded' : 'Exclude'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(110px, 1fr))`, gap: '0.75rem' }}>
                <div style={{ background: 'var(--bg-surface-raised)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>{preview.summary.totalRows}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Rows</div>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--status-available)' }}>{preview.summary.newCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--status-available)', textTransform: 'uppercase' }}>New</div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--status-booked)' }}>{preview.summary.statusChangeCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--status-booked)', textTransform: 'uppercase' }}>Status Changes</div>
                </div>

                <div style={{ background: 'var(--bg-surface-raised)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{preview.summary.unchangedCount}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unchanged</div>
                </div>

                {(preview.summary.conflictCount > 0) && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.conflictCount}</div>
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', textTransform: 'uppercase' }}>Conflicts</div>
                  </div>
                )}

                {preview.summary.missingCount > 0 && (
                  <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-gold)' }}>{preview.summary.missingCount}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--brand-gold)', textTransform: 'uppercase' }}>Missing Rows</div>
                  </div>
                )}

                {preview.summary.duplicateCount > 0 && (
                  <div style={{ background: 'rgba(212, 175, 55, 0.12)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(212, 175, 55, 0.35)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--brand-gold)' }}>{preview.summary.duplicateCount}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--brand-gold)', textTransform: 'uppercase' }}>
                      Duplicates ({preview.rows.filter((r: any) => r.changeType === 'DUPLICATE' && rowActions[r.rowIndex]?.action === 'KEEP').length} Kept)
                    </div>
                  </div>
                )}

                {preview.summary.invalidCount > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.18)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.5)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{preview.summary.invalidCount}</div>
                    <div style={{ fontSize: '0.68rem', color: '#ef4444', textTransform: 'uppercase' }}>Invalid Rows</div>
                  </div>
                )}
              </div>

              {/* Rows Table */}
              <div className="table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Property No</th>
                      <th>Status</th>
                      <th>Facing</th>
                      <th>Area (sq.ft)</th>
                      <th>Change Type & Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any, idx: number) => {
                      const rowAction = rowActions[r.rowIndex];
                      const isDuplicate = r.changeType === 'DUPLICATE';
                      const isDuplicateKept = isDuplicate && rowAction?.action === 'KEEP';
                      const isDuplicateExcluded = isDuplicate && (rowAction?.action === 'EXCLUDE' || (!rowAction && !isDuplicateKept));
                      const isSkipped = rowAction?.action === 'SKIP' || rowAction?.action === 'EXCLUDE' || (r.changeType === 'INVALID' && skipInvalidRows);
                      const isOverridden = rowAction?.action === 'SET_STATUS';

                      return (
                        <tr 
                          key={idx} 
                          style={{ 
                            opacity: (isSkipped || (isDuplicate && isDuplicateExcluded)) ? 0.55 : 1,
                            background: isDuplicateKept 
                              ? 'rgba(16, 185, 129, 0.08)' 
                              : isDuplicate 
                              ? 'rgba(212, 175, 55, 0.06)' 
                              : (r.changeType === 'INVALID' || r.changeType === 'CONFLICT' 
                              ? 'rgba(239, 68, 68, 0.08)' 
                              : (r.changeType === 'NEW' ? 'rgba(16, 185, 129, 0.08)' : (r.changeType === 'MISSING' ? 'rgba(245, 158, 11, 0.08)' : undefined))) 
                          }}
                        >
                          <td style={{ color: 'var(--text-muted)' }}>{r.rowIndex === -1 ? 'DB Only' : r.rowIndex}</td>
                          <td style={{ fontWeight: 700, color: '#fff' }}>
                            {r.propertyNumber}
                            {r.sectionOrPhase && (
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--brand-gold)' }}>
                                ({r.sectionOrPhase})
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`badge badge-${(isOverridden ? rowAction.status : r.status).toLowerCase()}`}>
                              {isOverridden ? `${rowAction.status} (override)` : r.status}
                            </span>
                          </td>
                          <td>{r.facing || '—'}</td>
                          <td>{r.areaSqft || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span 
                                className="badge"
                                style={{
                                   display: 'inline-block',
                                  width: 'fit-content',
                                  background: isDuplicateKept 
                                    ? 'rgba(16, 185, 129, 0.25)'
                                    : isDuplicate 
                                    ? 'rgba(212, 175, 55, 0.2)'
                                    : isSkipped 
                                    ? 'rgba(100, 116, 139, 0.3)' 
                                    : (r.changeType === 'NEW' ? 'rgba(16, 185, 129, 0.2)' : (r.changeType === 'STATUS_CHANGE' ? 'rgba(245, 158, 11, 0.2)' : (r.changeType === 'INVALID' || r.changeType === 'CONFLICT' ? 'rgba(239, 68, 68, 0.2)' : (r.changeType === 'MISSING' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(100, 116, 139, 0.2)')))),
                                  color: isDuplicateKept 
                                    ? 'var(--status-available)'
                                    : isDuplicate 
                                    ? 'var(--brand-gold)'
                                    : isSkipped 
                                    ? 'var(--text-muted)' 
                                    : (r.changeType === 'NEW' ? 'var(--status-available)' : (r.changeType === 'STATUS_CHANGE' ? 'var(--status-booked)' : (r.changeType === 'INVALID' || r.changeType === 'CONFLICT' ? '#ef4444' : (r.changeType === 'MISSING' ? 'var(--brand-gold)' : 'var(--text-muted)'))))
                                }}
                              >
                                {isDuplicateKept ? 'DUPLICATE (KEPT)' : (isDuplicate ? (isDuplicateExcluded ? 'DUPLICATE (EXCLUDED)' : 'DUPLICATE (REVIEW)') : (isSkipped ? 'SKIPPED' : (isOverridden ? 'STATUS OVERRIDE' : r.changeType)))}
                              </span>
                              {r.validationError && !isSkipped && !isDuplicateKept && (
                                <span style={{ fontSize: '0.72rem', color: isDuplicate ? 'var(--brand-gold)' : '#ef4444' }}>
                                  {r.validationError}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Dynamic Approved Counts Calculation & Action Bar */}
              {(() => {
                const keptDups = preview.rows.filter((r: any) => r.changeType === 'DUPLICATE' && rowActions[r.rowIndex]?.action === 'KEEP').length;
                const activeNew = preview.rows.filter((r: any) => r.changeType === 'NEW' && rowActions[r.rowIndex]?.action !== 'SKIP').length;
                const activeStatus = preview.rows.filter((r: any) => (r.changeType === 'STATUS_CHANGE' || r.changeType === 'UPDATED') && rowActions[r.rowIndex]?.action !== 'SKIP').length;
                const totalCommit = activeNew + activeStatus + keptDups;

                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button className="btn btn-secondary" onClick={() => setStep(2)}>
                      Back to Sheet Selection
                    </button>
                    <button 
                      className="btn btn-primary"
                      onClick={handleApplyImport}
                      disabled={isApplying || preview.summary.totalRows === 0 || totalCommit === 0}
                    >
                      <CheckCircle2 size={16} /> {isApplying ? 'Applying Approved Import...' : `Apply Approved Import (${totalCommit} Records)`}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
