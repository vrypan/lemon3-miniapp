// Cloudflare Worker that renders an IPFS DAG view + MiniApp metadata
import { marked } from 'marked';

function formatBytes(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function renderMarkdown(text: string): string {
	return marked.parse(text);
}

export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const pathParts = url.pathname.split('/').filter(Boolean);

		// Serve manifest
		if (url.pathname === '/.well-known/farcaster.json') {
			const manifest = {
				accountAssociation: {
					header: 'eyJmaWQiOjI4MCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweGQwNUQ2MGI1NzYyNzI4NDY2QjQzZGQ5NGJBODgyRDA1MGI2MEFGNjcifQ',
					payload: 'eyJkb21haW4iOiJsZW1vbjMudnJ5cGFuLndvcmtlcnMuZGV2In0',
					signature:
						'MHg5MWQ5MTQ4MjBlZDhlOWU1OTE4MGZjNjMyMTUyNzU5YmI2NTAxMmZlNmI2ZjIwZjMwZWJjYWRiYTQ4NjI4ZDQ0MTBmYjJkM2JhMTUzYzRjZDI4MzgxODNmYmQ2ZmM5NTlhOTkwZjI5NTFkYjFmN2JkYzcwMTA3Zjk0NDkwZmRmZDFi',
				},
				frame: {
					version: '1',
					name: 'lemon3 viewer',
					iconUrl: 'https://lemon3-assets.s3.amazonaws.com/lemon3.png',
					homeUrl: 'https://lemon3.vrypan.workers.dev/',
					imageUrl: 'https://lemon3-assets.s3.amazonaws.com/lemon3.png',
					buttonTitle: 'Open',
					splashImageUrl: 'https://lemon3-assets.s3.amazonaws.com/lemon3.png',
					splashBackgroundColor: '#F9E231',
				},
			};
			return new Response(JSON.stringify(manifest), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const cid = pathParts[0];
		if (!cid || !cid.startsWith('bafy')) {
			return new Response('Invalid or missing CID', { status: 400 });
		}

		try {
			const gateway = url.searchParams.get('gw') ?? 'https://ipfs.io';
			const ipfsUrl = `${gateway}/ipfs/${cid}?format=dag-json`;
			const ipfsResp = await fetch(ipfsUrl);

			if (!ipfsResp.ok) {
				return new Response(`Failed to fetch IPFS data: ${ipfsResp.statusText}`, {
					status: ipfsResp.status,
				});
			}

			const data = await ipfsResp.json();

			const title = data.title ?? 'Untitled';
			const description = data.description ? renderMarkdown(data.description) : '<p>No description.</p>';
			const enclosedCid = data.enclosed?.['/'];
			const artworkCid = data.artwork?.['/'];
			const filename = data.filename ?? 'unknown file';
			const size = data.size ? formatBytes(data.size) : 'unknown';
			const type = data.type ?? 'unknown';
			const downloadUrl = enclosedCid ? `${gateway}/ipfs/${enclosedCid}` : null;
			const artworkUrl = artworkCid ? `${gateway}/ipfs/${artworkCid}` : null;

			const isVideo = type.startsWith('video/') && downloadUrl;
			const isAudio = type.startsWith('audio/') && downloadUrl;
			const downloadLink = enclosedCid && filename ? `<a class="download" href="${downloadUrl}" download>${filename}</a>` : filename;

			const audioElement = isAudio
				? `<audio controls src="${downloadUrl}" style="width: 100%; margin-top: 1em;">
             Your browser does not support the audio element.
             <a href="${downloadUrl}">Download audio</a>.
           </audio>`
				: '';

			const metaFrame = `
        <meta name="fc:frame" content='{"version":"next","imageUrl":"${artworkUrl ?? 'https://lemon3-assets.s3.amazonaws.com/lemon3.png'}","button":{"title":"Open","action":{"type":"launch_frame","url":"${url.href}","name":"IPFS Viewer","splashImageUrl":"https://lemon3-assets.s3.amazonaws.com/lemon3.png","splashBackgroundColor":"#F9E231"}}}' />
      `;

			const videoElement = isVideo
				? `<video controls poster="${artworkUrl ?? ''}" src="${downloadUrl}" type="${type}">
             Your browser does not support the video tag.
             <a href="${downloadUrl}">Download video</a>.
           </video>`
				: '';

			const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${data.description?.slice(0, 200) ?? 'Media from IPFS'}" />
        ${isAudio ? `<meta property="og:audio" content="${downloadUrl}" />` : ''}
        ${isVideo ? `<meta property="og:video" content="${downloadUrl}" />` : ''}
        ${artworkUrl ? `<meta property="og:image" content="${artworkUrl}" />` : ''}
        ${metaFrame}
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 16px;
            line-height: 1.6;
            background-color: #fefefe;
            color: #222;
            padding: 1rem;
            max-width: 100%;
            margin: auto;
            box-sizing: border-box;
          }
          h1 { font-size: 1.4em; margin-bottom: 0.5em; }
          h2 { font-size: 1.1em; margin-top: 1.5em; margin-bottom: 0.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
          .meta { font-size: 0.9em; color: #666; margin-bottom: 1em; overflow-wrap: anywhere; }
          .download {
            display: inline-block;
            background-color: #f9e231;
            color: #111;
            font-weight: bold;
            text-decoration: none;
            padding: 0.4em 0.8em;
            border-radius: 6px;
            margin-top: 0.5em;
            white-space: nowrap;
          }
          .download:hover {
            background-color: #f7da00;
          }
          .raw-json {
            font-size: 0.75em;
            max-height: 200px;
            overflow: auto;
            background: #fafafa;
            border: 1px solid #eee;
            padding: 1em;
            border-radius: 6px;
          }
          details summary {
            font-weight: bold;
            cursor: pointer;
            margin-top: 1.5rem;
          }
          a { color: #0066cc; word-break: break-word; }
          video, img.artwork {
            width: 100%;
            max-width: 100%;
            border-radius: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            margin: 1.2rem 0;
          }
          header {
            display:flex;
            align-items:center;
            gap:0.5rem;
            margin-bottom:1rem;
          }
          header img { height: 28px; }
        </style>
      </head>
      <body>
        <header>
          <img src="https://lemon3-assets.s3.amazonaws.com/lemon3.png" alt="lemon3">
          <strong>lemon3 viewer</strong>
        </header>

        ${isVideo ? videoElement : ''}
${isAudio && artworkUrl ? `<img class="artwork" src="${artworkUrl}" alt="Artwork">` : ''}
${isAudio ? audioElement : ''}
${!isVideo && !isAudio && artworkUrl ? `<img class="artwork" src="${artworkUrl}" alt="Artwork">` : ''}

        <h1>${title}</h1>
        <div class="meta">
          <strong>Filename:</strong> ${downloadLink}<br/>
          <strong>Size:</strong> ${size}<br/>
          <strong>Type:</strong> ${type}
        </div>

        <div>${description}</div>

        <details>
          <summary>Debug JSON</summary>
          <pre class="raw-json">${JSON.stringify(data, null, 2)}</pre>

<div style="margin-top:2rem; font-size:0.75em; color:#aaa; text-align:center;">CID: ${cid}</div><script type="module">
          import { sdk } from "https://esm.sh/@farcaster/frame-sdk";
          sdk.actions.ready().then(() => {
            console.log("MiniApp ready in Farcaster");
          }).catch(err => {
            console.warn("Frame SDK not initialized", err);
          });
        </script>
      </body>
      </html>`;

			return new Response(html, {
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		} catch (err) {
			return new Response('Internal error fetching IPFS data', { status: 500 });
		}
	},
};
