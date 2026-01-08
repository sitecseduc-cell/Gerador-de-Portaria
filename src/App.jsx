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
    Upload,
    ZoomIn,
    ZoomOut,
    X,
    FileDown
} from 'lucide-react';
import Papa from 'papaparse';

const App = () => {
    const [sheetUrl, setSheetUrl] = useState('');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false); // [NEW] Downloading state
    const [error, setError] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [groupByCol, setGroupByCol] = useState('');
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [onlyValidated, setOnlyValidated] = useState(false);
    const [colSearch, setColSearch] = useState('');
    const [zoom, setZoom] = useState(1);
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

    const handleDownloadDocx = async () => {
        if (!sheetUrl) return;
        setDownloading(true);
        try {
            const response = await fetch('/api/processar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    link: sheetUrl,
                    aba: 'Página1', // Default assume 'Página1', could be configurable
                    letra_escola: 'A', // Default based on backend logic
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.erro || 'Erro ao gerar documento');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Portaria_${new Date().toISOString().slice(0, 10)}.docx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            alert(`Erro ao baixar: ${err.message}`);
        } finally {
            setDownloading(false);
        }
    };

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
        if (data.length === 0) return [];

        // Otimização: Identifica a chave da coluna 33 (AH) uma única vez
        const sampleRow = data[0];
        const colunas = Object.keys(sampleRow);

        // Verifica se existe coluna no índice 33
        if (colunas.length <= 33) return data;

        const chaveAH = colunas[33];

        return data.filter(row => {
            // Acesso direto pela chave pré-identificada, muito mais rápido que Object.keys(row) em cada iteração
            const val = row[chaveAH];
            // Verificação rápida de string
            return val && val.trim().toUpperCase() === 'VALIDADO';
        });
    }, [data]);

    // Atualize as colunas selecionadas para bater com sua exigência
    useEffect(() => {
        if (data.length > 0) {
            const colunasExigidas = [
                "NOME DA ESCOLA", "MUNICÍPIO", "DRE", "MATRÍCULA", "VÍNCULO", "MAT + VINC",
                "NOME DO SERVIDOR", "CATEGORIA", "CARGO", "EXERCÍCIO", "PERÍODO AQUISITIVO (INÍCIO)",
                "PERIODO AQUISITIVO (FIM)", "PERÍODO AQUISITIVO", "EXERCÍCIO", "PERÍODO AQUISITIVO (INÍCIO)",
                "PERIODO AQUISITIVO (FIM)", "PERÍODO AQUISITIVO", "1º PERÍODO DE FÉRIAS ou ÚNICO (INICIO)",
                "1º PERÍODO DE FÉRIAS ou ÚNICO (FIM)", "DIAS FÉRIAS", "1º PERÍODO DE FÉRIAS",
                "2º PERÍODO DE FÉRIAS (INICIO)", "2º PERÍODO DE FÉRIAS (FIM)", "DIAS FÉRIAS",
                "2º PERÍODO DE FÉRIAS", "DIAS FÉRIAS (TOTAL)", "OBSERVAÇÃO VALIDAÇÃO (ETAPA 1)"
            ];
            // Filtra as colunas exigidas para garantir que existam no dado carregado, se não, pode dar erro visual
            // Mas o usuário pediu para setar essas. Vou setar. Se não existirem nas keys, o renderer vai mostrar vazio.
            setSelectedColumns(colunasExigidas);

            // Tenta forçar o agrupamento pela primeira coluna (ESCOLA) se disponível
            const colunas = Object.keys(data[0]);
            if (colunas.length > 0) {
                setGroupByCol(colunas[0]);
            }
        }
    }, [data]);

    const groupedData = useMemo(() => {
        if (!filteredData || filteredData.length === 0 || !groupByCol) return {};
        const groups = {};
        for (const row of filteredData) {
            const key = row[groupByCol] || 'OUTROS';
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        }
        return groups;
    }, [filteredData, groupByCol]);

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
                        <div className="flex items-center gap-3 bg-slate-100/50 px-3 py-1.5 rounded-lg border border-slate-200/60 transition-all hover:bg-slate-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agrupar</span>
                            <div className="h-4 w-[1px] bg-slate-300"></div>
                            <select
                                value={groupByCol}
                                onChange={(e) => setGroupByCol(e.target.value)}
                                className="bg-transparent border-none text-slate-700 text-xs font-bold uppercase focus:ring-0 p-0 cursor-pointer outline-none min-w-[100px]"
                            >
                                {Object.keys(data[0]).map(k => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="h-6 w-[1px] bg-slate-200 mx-2"></div>

                    <button
                        onClick={handleDownloadDocx}
                        disabled={data.length === 0 || downloading}
                        className="group flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-slate-200/50 active:scale-95"
                    >
                        {downloading ? <RefreshCw size={18} className="animate-spin text-blue-600" /> : <FileDown size={18} className="text-blue-600 group-hover:scale-110 transition-transform" />}
                        <span className="font-semibold text-sm">Baixar DOCX</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        disabled={data.length === 0}
                        className="group flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl transition-all shadow-xl shadow-slate-900/10 disabled:opacity-50 disabled:shadow-none hover:translate-y-[-1px] active:translate-y-[1px]"
                    >
                        <Printer size={18} className="group-hover:text-blue-200 transition-colors" />
                        <span className="font-medium text-sm">Imprimir</span>
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

                            {/* Column Search */}
                            <div className="mb-3 relative group">
                                <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={14} />
                                <input
                                    type="text"
                                    placeholder="Buscar coluna..."
                                    value={colSearch}
                                    onChange={(e) => setColSearch(e.target.value)}
                                    className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                                {colSearch && (
                                    <button onClick={() => setColSearch('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto custom-scrollbar p-2 border border-slate-200 rounded-xl bg-slate-50/50">
                                {Object.keys(data[0])
                                    .filter(col => col.toLowerCase().includes(colSearch.toLowerCase()))
                                    .map(col => {
                                        const isSelected = selectedColumns.includes(col);
                                        return (
                                            <button
                                                key={col}
                                                onClick={() => {
                                                    if (isSelected) setSelectedColumns(selectedColumns.filter(c => c !== col));
                                                    else setSelectedColumns([...selectedColumns, col]);
                                                }}
                                                className={`
                                                w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center justify-between group
                                                ${isSelected
                                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 border-transparent text-white shadow-md shadow-blue-500/20'
                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                                                    }
                                            `}
                                            >
                                                <span className="truncate pr-2">{col}</span>
                                                <div className={`
                                                w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0
                                                ${isSelected ? 'bg-white/20 border-white/50' : 'border-slate-300 group-hover:border-blue-400'}
                                            `}>
                                                    {isSelected && <CheckCircle2 size={10} className="text-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                {Object.keys(data[0]).filter(c => c.toLowerCase().includes(colSearch.toLowerCase())).length === 0 && (
                                    <div className="text-center py-8 text-slate-400 text-xs">
                                        Nenhuma coluna encontrada
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-xl shadow-slate-200/40 border border-white/50">
                        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div> Configuração do Cabeçalho
                        </h2>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Instituição / Órgão</label>
                                <input type="text" placeholder="Ex: PREFEITURA MUNICIPAL..." value={config.orgao} onChange={e => setConfig({ ...config, orgao: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Setor / Departamento</label>
                                <input type="text" placeholder="Ex: Gabinete do Prefeito" value={config.setor} onChange={e => setConfig({ ...config, setor: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Cidade</label>
                                    <input type="text" placeholder="Cidade" value={config.cidade} onChange={e => setConfig({ ...config, cidade: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">UF</label>
                                    <input type="text" placeholder="UF" value={config.estado} onChange={e => setConfig({ ...config, estado: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white transition-all shadow-sm" />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="lg:col-span-8 print:w-full print:absolute print:top-0 print:left-0 flex flex-col h-full">
                    <div className="bg-slate-200/40 border border-slate-200/50 rounded-3xl p-8 flex-1 flex flex-col items-center justify-start overflow-auto relative shadow-inner print:bg-white print:p-0 print:border-none print:shadow-none print:rounded-none">

                        {!data.length && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 opacity-60 pointer-events-none select-none">
                                <div className="bg-slate-100 p-8 rounded-3xl mb-6 shadow-sm border border-slate-200/50">
                                    <FileText size={64} className="text-slate-300 stroke-1" />
                                </div>
                                <p className="font-semibold text-xl text-slate-500">Aguardando dados</p>
                                <p className="text-sm mt-1 max-w-[250px] text-center">Importe uma planilha ou arquivo CSV para gerar a visualização do documento.</p>
                            </div>
                        )}

                        <div className={`
                            relative transition-all duration-500 ease-out transform origin-top flex flex-col items-center
                            ${data.length > 0 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-95'}
                        `}>
                            {data.length > 0 && (
                                <div className="sticky top-0 z-30 mb-8 mt-2 print:hidden backdrop-blur-xl bg-slate-900/80 text-white px-2 py-1.5 rounded-full flex items-center gap-4 shadow-xl shadow-slate-900/20 border border-white/10 transition-all hover:bg-slate-900">
                                    <button
                                        onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
                                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                                    >
                                        <ZoomOut size={16} />
                                    </button>
                                    <span className="text-xs font-medium w-12 text-center tabular-nums">
                                        {Math.round(zoom * 100)}%
                                    </span>
                                    <button
                                        onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                                    >
                                        <ZoomIn size={16} />
                                    </button>
                                    <div className="w-[1px] h-4 bg-white/20"></div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 opacity-60">Visualização A4</span>
                                </div>
                            )}

                            <div
                                ref={printRef}
                                className="bg-white w-[210mm] min-h-[297mm] p-[10mm] shadow-2xl shadow-slate-900/10 text-[#222] print:shadow-none print:w-full print:p-[5mm] print:mx-0 relative z-10 transition-transform duration-200 ease-out print:!transform-none print:!m-0 print:!h-auto print:!overflow-visible"
                                style={{
                                    fontFamily: '"Times New Roman", Times, serif',
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'top center'
                                }}
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
                                                <div className="w-full overflow-x-auto border border-slate-100 rounded mb-2 print:border-none print:overflow-visible">
                                                    <table className="w-full border-collapse border border-black text-[9px] min-w-max print:min-w-full print:table-fixed">
                                                        <thead>
                                                            <tr className="bg-gray-100 print:bg-gray-100">
                                                                {selectedColumns.map((header, idx) => (
                                                                    <th key={`${header}-${idx}`} className="border border-black p-1.5 uppercase font-bold whitespace-nowrap print:whitespace-normal">{header}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {groupItems.map((row, rIdx) => (
                                                                <tr key={rIdx} className="text-center hover:bg-slate-50 print:hover:bg-transparent">
                                                                    {selectedColumns.map((key, cIdx) => (
                                                                        <td key={`${key}-${cIdx}`} className="border border-black p-1.5 whitespace-nowrap print:whitespace-normal">{row[key]}</td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
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
