export default async function handler(request, response) {
    const { url } = request.query;

    if (!url) {
        return response.status(400).json({ error: 'URL is required' });
    }

    try {
        // 1. Tenta converter link de visualização para exportação CSV caso o usuário tenha passado o link normal
        let targetUrl = url;
        if (url.includes('/edit') || url.includes('/view')) {
            targetUrl = url.replace(/\/edit.*$/, '/export?format=csv').replace(/\/view.*$/, '/export?format=csv');
        }

        // Se não tiver o formato csv explícito, força (para casos de link 'copy')
        if (!targetUrl.includes('format=csv') && targetUrl.includes('/spreadsheets/d/')) {
            targetUrl = targetUrl.replace(/\/$/, '') + '/export?format=csv'; // Tentativa genérica
        }

        console.log(`Proxying request to: ${targetUrl}`);

        const fetchResponse = await fetch(targetUrl);

        // Se o Google redirecionar para Login, significa que a planilha não é pública
        if (fetchResponse.url.includes('accounts.google.com/ServiceLogin')) {
            return response.status(403).json({
                error: 'Private Sheet',
                message: 'A planilha está privada. Por favor, compartilhe como "Qualquer pessoa com o link".'
            });
        }

        if (!fetchResponse.ok) {
            return response.status(fetchResponse.status).json({ error: `Failed to fetch: ${fetchResponse.statusText}` });
        }

        const text = await fetchResponse.text();

        // Configura headers para permitir acesso do nosso frontend
        response.setHeader('Access-Control-Allow-Origin', '*');
        response.setHeader('Content-Type', 'text/csv');
        return response.status(200).send(text);

    } catch (error) {
        console.error('Proxy Error:', error);
        return response.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
