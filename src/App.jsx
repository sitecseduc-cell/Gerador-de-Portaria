import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
    FileText,
    Link as LinkIcon,
    Download,
    Printer,
    Search,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Settings,
    Upload
} from 'lucide-react';
import Papa from 'papaparse';

const App = () => {
    const [sheetUrl, setSheetUrl] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [groupByCol, setGroupByCol] = useState('');
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [onlyValidated, setOnlyValidated] = useState(false); // [NEW] Filter state
    const [config, setConfig] = useState({
        orgao: 'PREFEITURA MUNICIPAL DE EXEMPLO',
        setor: 'Gabinete do Prefeito',
        cidade: 'Cidade Exemplo',
        estado: 'UF'
    });

    const printRef = useRef();

    useEffect(() => {
        if (data.length > 0 && selectedColumns.length === 0) {
            setSelectedColumns(Object.keys(data[0]));
        }
    }, [data]);

    const getCsvUrl = (url) => {
        try {
            if (!url) return '';
            if (url.includes('/edit')) return url.replace(/\/edit.*$/, '/export?format=csv');
            if (url.includes('/spreadsheets/d/')) {
                const id = url.split('/d/')[1].split('/')[0];
                return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
            }
            return url;
        } catch (e) { return url; }
    };

    const processData = (results) => {
        if (results.meta && results.meta.fields && results.meta.fields.length === 1 && results.meta.fields[0].includes('<!DOCTYPE html>')) {
            setError('A planilha parece estar privada. Por favor, compartilhe como "Qualquer pessoa com o link".');
            setLoading(false);
            return;
        }

        if (results.errors.length > 0) console.warn("Erros no CSV:", results.errors);

        let rawRows = results.data;
        if (!rawRows || rawRows.length === 0) {
            setError('A planilha parece estar vazia ou o formato é inválido.');
            setLoading(false);
            return;
        }

        const keywords = ['nome', 'servidor', 'funcionário', 'cargo', 'função', 'lotação', 'escola', 'unidade', 'matricula', 'vínculo', 'cpf'];
        let headerRowIndex = 0;
        let headerRow = rawRows[0];
        let maxMatches = 0;

        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
            const rowStr = rawRows[i].map(c => String(c).toLowerCase()).join(' ');
            const matchCount = keywords.filter(k => rowStr.includes(k)).length;
            if (matchCount > maxMatches) {
                maxMatches = matchCount;
                headerRowIndex = i;
                headerRow = rawRows[i];
            }
        }

        if (maxMatches === 0) {
            for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                if (rawRows[i].some(c => c && String(c).trim().length > 0)) {
                    headerRowIndex = i;
                    headerRow = rawRows[i];
                    break;
                }
            }
        }

        const headerMap = headerRow.map((h, idx) => {
            const val = h ? String(h).trim() : `Coluna ${idx + 1}`;
            return {
                original: val,
                normalized: val.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, "")
            };
        });

        const validRows = [];
        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (row.every(cell => !cell || String(cell).trim() === '')) continue;

            const newRow = {};
            let hasData = false;

            headerMap.forEach((hInfo, idx) => {
                let cellValue = row[idx];
                if (typeof cellValue === 'string') {
                    if (['#REF!', '#NAME?', '#VALUE?', '#DIV/0!', '#N/A'].includes(cellValue)) cellValue = '';
                }
                if (cellValue) hasData = true;

                let key = hInfo.original;
                if (newRow.hasOwnProperty(key)) key = `${key}_${idx}`;
                newRow[key] = cellValue;
            });

            if (hasData) validRows.push(newRow);
        }

        if (validRows.length > 0) {
            setData(validRows);
            setSelectedRow(validRows[0]);

            const keys = Object.keys(validRows[0]);
            setSelectedColumns(keys);

            const isCandidate = (k) => {
                const norm = k.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                return ['escola', 'unidade', 'lotacao', 'setor'].some(cand => norm.includes(cand));
            };

            const candidate = keys.find(k => isCandidate(k));
            if (candidate) setGroupByCol(candidate);
            else {
                const reasonableCol = keys.find(k => k.toLowerCase() !== 'id' && !k.toLowerCase().includes('data') && !k.match(/^[0-9]+$/));
                setGroupByCol(reasonableCol || keys[0]);
            }
            setLoading(false);
        } else {
            setError('Não foram encontrados dados válidos após o processamento.');
            setLoading(false);
        }
    };

    const handleFetchData = async () => {
        if (!sheetUrl) { setError('Por favor, insira o link da planilha.'); return; }
        setLoading(true); setError(null); setData([]); setSelectedRow(null);

        try {
            let targetUrl = getCsvUrl(sheetUrl);
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            Papa.parse(proxyUrl, {
                download: true, header: false, skipEmptyLines: true, complete: processData,
                error: (err) => { setError(`Erro ao carregar: ${err.message}. Verifique se a planilha é PÚBLICA.`); setLoading(false); }
            });
        } catch (err) { setError(err.message); setLoading(false); }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        setLoading(true); setError(null); setData([]); setSelectedRow(null);
        Papa.parse(file, {
            header: false, skipEmptyLines: true, complete: processData,
            error: (err) => { setError(`Erro ao ler arquivo: ${err.message}`); setLoading(false); }
        });
    };

    const handlePrint = () => window.print();
    const formatDate = (dateStr) => {
        if (!dateStr) return new Date().toLocaleDateString('pt-BR');
        try {
            const date = new Date(dateStr);
            if (!isNaN(date)) return date.toLocaleDateString('pt-BR');
        } catch (e) { }
        return dateStr;
    };


    const filteredData = useMemo(() => {
        if (!onlyValidated) return data;

        // Tenta encontrar a coluna específica de validação
        // Prioriza colunas que contenham "VALIDAÇÃO"
        const validationCol = Object.keys(data[0] || {}).find(k =>
            k.toUpperCase().includes('VALIDAÇÃO') ||
            k.toUpperCase().includes('STATUS') ||
            k.toUpperCase() === 'SITUAÇÃO'
        );

        if (validationCol) {
            console.log(`[FILTER] Filtrando pela coluna: "${validationCol}"`);
            return data.filter(row => {
                const val = String(row[validationCol] || '').trim().toUpperCase();

                // CRITICAL: Exclude "NÃO VALIDADO", "NAO VALIDADO", or empty
                if (!val) return false;
                if (val.includes('NÃO') || val.includes('NAO')) return false;

                // Accept "VALIDADO" strict or slightly loose but positive
                return val.includes('VALIDADO') || val === 'SIM' || val === 'OK';
            });
        }

        console.warn("[FILTER] Nenhuma coluna de validação específica encontrada. Usando busca global.");
        // Fallback global (ainda excluindo o NÃO)
        return data.filter(row => {
            return Object.values(row).some(cell => {
                const val = String(cell).trim().toUpperCase();
                return (val.includes('VALIDADO') && !val.includes('NÃO') && !val.includes('NAO'));
            });
        });
    }, [data, onlyValidated]);

    const getGroupedData = () => {
        if (!filteredData || filteredData.length === 0 || !groupByCol) return {};
        const groups = {};
        filteredData.forEach(row => {
            const key = row[groupByCol] || 'OUTROS';
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        return groups;
    };

    const groupedData = getGroupedData();

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-['Outfit'] text-slate-800 print:bg-white print:block selection:bg-blue-100 selection:text-blue-900">
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden print:hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-3xl opacity-60"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-3xl opacity-60"></div>
            </div>

            <nav className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 px-8 py-4 flex items-center justify-between sticky top-0 z-50 print:hidden transition-all duration-300">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20">
                        <FileText size={22} className="stroke-[2.5]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">Portaria<span className="text-blue-600">Flow</span></h1>
                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mt-0.5">Gerador Profissional</p>
                    </div>
                </div>
                <div className="flex gap-4 items-center">
                    {data.length > 0 && (
                        <div className="flex items-center gap-3 bg-slate-100/50 px-3 py-1.5 rounded-lg border border-slate-200/60">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agrupar por</span>
                            <div className="h-4 w-[1px] bg-slate-300"></div>
                            <select
                                value={groupByCol}
                                onChange={(e) => setGroupByCol(e.target.value)}
                                className="bg-transparent border-none text-slate-700 text-sm font-medium focus:ring-0 p-0 cursor-pointer outline-none min-w-[120px]"
                            >
                                {Object.keys(data[0]).map(k => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button
                        onClick={handlePrint}
                        disabled={data.length === 0}
                        className="group flex items-center gap-2.5 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50 disabled:shadow-none hover:translate-y-[-1px] active:translate-y-[1px]"
                    >
                        <Printer size={18} className="group-hover:text-blue-200 transition-colors" />
                        <span className="font-medium">Imprimir</span>
                    </button>
                </div>
            </nav>

            <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-[1600px] mx-auto w-full relative z-10 print:block print:p-0 print:m-0 print:w-full">
                <div className="lg:col-span-4 flex flex-col gap-6 print:hidden">
                    <section className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-xl shadow-slate-200/40 border border-white/50 transition-all hover:shadow-2xl hover:shadow-slate-200/50">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Fonte de Dados
                        </h2>

                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-sm font-semibold text-slate-700 block">Link do Google Sheets</label>
                                <div className="flex gap-2 relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                        <LinkIcon size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="https://docs.google.com/spreadsheets/..."
                                        className="flex-1 pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all bg-slate-50 focus:bg-white"
                                        value={sheetUrl}
                                        onChange={(e) => setSheetUrl(e.target.value)}
                                    />
                                    <button
                                        onClick={handleFetchData}
                                        disabled={loading}
                                        className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-xl transition-all disabled:bg-slate-200 disabled:text-slate-400 shadow-lg shadow-blue-500/20"
                                    >
                                        {loading ? <RefreshCw className="animate-spin" size={20} /> : <Download size={20} />}
                                    </button>
                                </div>
                            </div>
                            <div className="relative flex items-center py-1">
                                <div className="flex-grow border-t border-slate-200"></div>
                                <span className="flex-shrink-0 mx-4 text-slate-300 text-[10px] font-bold uppercase tracking-widest">OU ARQUIVO LOCAL</span>
                                <div className="flex-grow border-t border-slate-200"></div>
                            </div>
                            <div className="space-y-2">
                                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-all group">
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        <Upload size={24} className="text-slate-300 mb-2 group-hover:text-blue-500 transition-colors scale-100 group-hover:scale-110 duration-300" />
                                        <p className="mb-1 text-sm text-slate-500 font-medium group-hover:text-slate-700">Clique para enviar CSV</p>
                                        <p className="text-xs text-slate-400">Suporta arquivos .csv</p>
                                    </div>
                                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                                </label>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-6 p-4 bg-red-50/50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-2">
                                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                                <span className="font-medium">{error}</span>
                            </div>
                        )}
                        {data.length > 0 && !error && (
                            <div className="mt-6 flex flex-col gap-4">
                                <div className="p-4 bg-green-50/50 border border-green-100 rounded-xl flex items-center gap-3 text-green-700 text-sm animate-in fade-in slide-in-from-top-2">
                                    <div className="bg-green-100 p-1.5 rounded-full shrink-0">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <span className="font-bold">{data.length} registros processados.</span>
                                </div>

                                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 transition-all">
                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Apenas Validados</span>
                                            <span className="text-[10px] text-slate-500">Filtrar onde consta "VALIDADO"</span>
                                        </div>
                                        <div className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={onlyValidated}
                                                onChange={(e) => setOnlyValidated(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </div>
                                    </label>
                                    {onlyValidated && (
                                        <div className="mt-2 text-[10px] text-blue-600 font-medium text-right animate-in fade-in">
                                            Exibindo {filteredData.length} registros
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {data.length > 0 && (
                        <section className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-xl shadow-slate-200/40 border border-white/50">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Colunas Visíveis
                                </h2>
                                <div className="flex gap-2">
                                    <button onClick={() => setSelectedColumns(Object.keys(data[0]))} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors">TODAS</button>
                                    <button onClick={() => setSelectedColumns([])} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 px-2 py-1 rounded transition-colors">NENHUMA</button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                                {Object.keys(data[0]).map(col => {
                                    const isSelected = selectedColumns.includes(col);
                                    return (
                                        <button
                                            key={col}
                                            onClick={() => {
                                                if (isSelected) setSelectedColumns(selectedColumns.filter(c => c !== col));
                                                else setSelectedColumns([...selectedColumns, col]);
                                            }}
                                            className={`
                                                px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center gap-2
                                                ${isSelected
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 transform scale-105'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                                }
                                            `}
                                        >
                                            {isSelected && <CheckCircle2 size={10} className="stroke-[3]" />}
                                            {col}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    <section className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-xl shadow-slate-200/40 border border-white/50">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div> Cabeçalho do Documento
                        </h2>
                        <div className="grid grid-cols-1 gap-4">
                            <input type="text" placeholder="Nome do Órgão" value={config.orgao} onChange={e => setConfig({ ...config, orgao: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-200 outline-none bg-slate-50/50 focus:bg-white transition-all" />
                            <input type="text" placeholder="Setor" value={config.setor} onChange={e => setConfig({ ...config, setor: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-200 outline-none bg-slate-50/50 focus:bg-white transition-all" />
                            <div className="grid grid-cols-2 gap-3">
                                <input type="text" placeholder="Cidade" value={config.cidade} onChange={e => setConfig({ ...config, cidade: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-200 outline-none bg-slate-50/50 focus:bg-white transition-all" />
                                <input type="text" placeholder="UF" value={config.estado} onChange={e => setConfig({ ...config, estado: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-slate-200 outline-none bg-slate-50/50 focus:bg-white transition-all" />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="lg:col-span-8 print:w-full print:absolute print:top-0 print:left-0 flex flex-col h-full">
                    <div className="bg-slate-200/40 border border-slate-200/50 rounded-3xl p-8 flex-1 flex flex-col items-center justify-start overflow-auto relative shadow-inner print:bg-white print:p-0 print:border-none print:shadow-none print:rounded-none">

                        {!data.length && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 opacity-60 pointer-events-none">
                                <div className="bg-slate-100 p-6 rounded-full mb-4">
                                    <FileText size={48} className="text-slate-300" />
                                </div>
                                <p className="font-medium text-lg">Aguardando dados...</p>
                                <p className="text-sm">Importe uma planilha para gerar a visualização</p>
                            </div>
                        )}

                        <div className={`
                            relative transition-all duration-500 ease-out transform origin-top
                            ${data.length > 0 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'}
                        `}>
                            {data.length > 0 && (
                                <div className="absolute -top-12 left-0 right-0 flex justify-center items-center gap-2 text-slate-500 mb-4 print:hidden">
                                    <span className="text-[10px] font-bold uppercase tracking-widest bg-white/80 py-1 px-3 rounded-full shadow-sm border border-slate-100">Visualização de Impressão (A4)</span>
                                </div>
                            )}

                            <div
                                ref={printRef}
                                className="bg-white w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl shadow-slate-900/10 text-[#222] print:shadow-none print:w-full print:p-[15mm] print:mx-0 relative z-10"
                                style={{ fontFamily: '"Times New Roman", Times, serif' }}
                            >
                                <div className="text-center mb-10 uppercase font-bold border-b-2 border-black pb-4">
                                    <div className="text-lg tracking-wide">{config.orgao}</div>
                                    <div className="text-md opacity-80">{config.setor}</div>
                                </div>

                                <div className="text-center mb-10 uppercase font-bold">
                                    <div className="text-xl tracking-wider">PORTARIA Nº XXXX/{new Date().getFullYear()}</div>
                                </div>

                                {data.length > 0 && (
                                    <div className="text-justify leading-relaxed text-sm">
                                        <div className="mb-8 font-normal">
                                            <p className="mb-6 indent-8">O(A) SECRETÁRIO(A) DE ESTADO DE EDUCAÇÃO DO PARÁ, no uso de suas atribuições...</p>
                                            <p className="font-bold uppercase tracking-widest text-center py-4 text-xs">RESOLVE:</p>
                                            <p className="mb-4 indent-8"><strong>Art. 1º</strong> CONCEDER benefícios aos servidores relacionados no <strong>ANEXO ÚNICO</strong> desta portaria.</p>
                                            <p className="mb-4 indent-8"><strong>Art. 2º</strong> Esta portaria entra em vigor na data de sua publicação.</p>
                                        </div>

                                        {Object.entries(groupedData).map(([groupName, groupItems], idx) => (
                                            <div key={idx} className="mb-8 break-inside-avoid mt-8">
                                                <h4 className="font-bold text-xs mb-3 uppercase border-l-4 border-black pl-2 tracking-wide">ANEXO - {groupName}</h4>
                                                <table className="w-full border-collapse border border-black text-[9px]">
                                                    <thead>
                                                        <tr className="bg-gray-100">
                                                            {selectedColumns.map(header => (
                                                                <th key={header} className="border border-black p-1.5 uppercase font-bold">{header}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {groupItems.map((row, rIdx) => (
                                                            <tr key={rIdx} className="text-center">
                                                                {selectedColumns.map((key, cIdx) => (
                                                                    <td key={cIdx} className="border border-black p-1.5">{row[key]}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))}

                                        <div className="mt-24 text-center break-inside-avoid">
                                            <p className="mb-16">{config.cidade} - {config.estado}, {formatDate(new Date())}.</p>
                                            <div className="inline-block border-t border-black pt-2 px-16">
                                                <p className="font-bold uppercase text-xs tracking-widest">Assinatura do Gestor</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
