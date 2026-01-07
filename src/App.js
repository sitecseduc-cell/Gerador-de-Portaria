import React, { useState } from 'react';

function App() {
  const [link, setLink] = useState('');
  const [aba, setAba] = useState('BASE A');
  const [letraEscola, setLetraEscola] = useState('A');
  const [filtroExclusao, setFiltroExclusao] = useState('');
  
  // Controle de Interface e Dados
  const [colunas, setColunas] = useState([]); // Lista {id, nome}
  const [excluidos, setExcluidos] = useState([]); // Lista de IDs marcados
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [resultadoLink, setResultadoLink] = useState(null);

  // 1. Ler Colunas
  const carregarColunas = async () => {
    setLoading(true);
    setStatus('Carregando colunas...');
    try {
      const res = await fetch('/api/obter_colunas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, aba })
      });
      const data = await res.json();
      if (data.erro) throw new Error(data.erro);
      
      setColunas(data);
      setStatus('✅ Colunas carregadas. Marque as que deseja EXCLUIR.');
    } catch (e) {
      setStatus(`❌ Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Manipular Checkbox
  const toggleExclusao = (id) => {
    setExcluidos(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 2. Gerar Documento
  const gerar = async (formato) => {
    setLoading(true);
    setStatus(`⏳ Gerando ${formato}... Aguarde.`);
    setResultadoLink(null);

    try {
      const res = await fetch('/api/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link,
          aba,
          letra_escola: letraEscola,
          filtro_exclusao: filtroExclusao,
          indices_excluir: excluidos,
          formato
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.erro || 'Erro no processamento');
      }

      if (formato === 'PDF') {
        // Para PDF, o backend retorna o arquivo binário (blob)
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "PORTARIA_GERADA.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus('✅ PDF baixado com sucesso!');
      } else {
        // Para DOCS, o backend retorna um JSON com o link
        const data = await res.json();
        setStatus(data.mensagem);
        setResultadoLink(data.link);
      }

    } catch (e) {
      setStatus(`❌ Erro ao gerar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#050a1f', color: 'white', minHeight: '100vh',
      padding: '20px', fontFamily: 'sans-serif', display: 'flex', justifyContent: 'center'
    }}>
      <div style={{ maxWidth: '700px', width: '100%', border: '1px solid #1e3a8a', borderRadius: '15px', padding: '30px', backgroundColor: '#050a1f' }}>
        
        <h2 style={{ color: '#14b8a6', textAlign: 'center', marginBottom: '20px' }}>
          Gerador SEDUC - Versão React
        </h2>

        {/* INPUTS INICIAIS */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '11px', display: 'block', marginBottom: '5px' }}>LINK DA PLANILHA</label>
          <input 
            type="text" 
            value={link}
            onChange={(e) => setLink(e.target.value)}
            style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '5px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input 
            type="text" 
            value={aba}
            onChange={(e) => setAba(e.target.value)}
            style={{ flex: 2, padding: '10px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '5px' }}
          />
          <button 
            onClick={carregarColunas} 
            disabled={loading}
            style={{ flex: 1, background: '#14b8a6', color: '#050a1f', fontWeight: 'bold', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '...' : '1. LER COLUNAS'}
          </button>
        </div>

        {/* ÁREA DE CHECKBOXES */}
        {colunas.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: '#fbbf24', margin: '0 0 10px 0' }}><b>⚠️ MARQUE O QUE NÃO PODE APARECER:</b></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {colunas.map(col => (
                <label key={col.id} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input 
                    type="checkbox" 
                    checked={excluidos.includes(col.id)}
                    onChange={() => toggleExclusao(col.id)}
                  />
                  {col.nome}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* INPUTS FINAIS */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', display: 'block' }}>LETRA ESCOLA</label>
            <input 
              type="text" value={letraEscola} onChange={(e) => setLetraEscola(e.target.value)}
              style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '5px' }} 
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '11px', display: 'block' }}>FILTRO EXCLUSÃO</label>
            <input 
              type="text" value={filtroExclusao} onChange={(e) => setFiltroExclusao(e.target.value)}
              placeholder="Ex: CANCELADO"
              style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #334155', color: 'white', borderRadius: '5px' }} 
            />
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button 
            onClick={() => gerar('DOCS')} 
            disabled={loading}
            style={{ padding: '15px', background: '#4285f4', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            GOOGLE DOCS
          </button>
          <button 
            onClick={() => gerar('PDF')} 
            disabled={loading}
            style={{ padding: '15px', background: '#ea4335', color: 'white', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            PDF (DOWNLOAD)
          </button>
        </div>

        {/* STATUS */}
        <div style={{ marginTop: '20px', textAlign: 'center', color: '#fbbf24', fontWeight: 'bold', minHeight: '20px' }}>
          {status}
        </div>
        
        {resultadoLink && (
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            <a href={resultadoLink} target="_blank" rel="noreferrer" style={{ color: '#14b8a6', textDecoration: 'underline' }}>
              ABRIR DOCUMENTO CRIADO
            </a>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
