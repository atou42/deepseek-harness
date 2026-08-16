import http from 'node:http'
import net from 'node:net'

function port(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new TypeError(`${name} must be an integer from 1 to 65535`)
  }
  return value
}

const listenPort = port('DSH_PREVIEW_LISTEN_PORT', 5173)
const upstreamPort = port('DSH_PREVIEW_UPSTREAM_PORT', 3081)
const upstreamHost = '127.0.0.1'

function upstreamHeaders(headers) {
  const result = { ...headers, host: `${upstreamHost}:${upstreamPort}` }
  if (result.origin !== undefined) result.origin = `http://${upstreamHost}:${upstreamPort}`
  return result
}

const server = http.createServer((request, response) => {
  const upstream = http.request({
    host: upstreamHost,
    port: upstreamPort,
    method: request.method,
    path: request.url,
    headers: upstreamHeaders(request.headers),
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', (error) => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`upstream unavailable: ${error.message}`)
  })
  request.pipe(upstream)
})

server.on('upgrade', (request, socket, head) => {
  const upstream = net.connect(upstreamPort, upstreamHost)
  upstream.once('connect', () => {
    const headers = upstreamHeaders(request.headers)
    const lines = [`${request.method} ${request.url} HTTP/${request.httpVersion}`]
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) continue
      lines.push(`${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })

  const close = () => {
    socket.destroy()
    upstream.destroy()
  }
  socket.on('error', close)
  upstream.on('error', close)
})

server.listen(listenPort, '0.0.0.0', () => {
  console.log(`preview proxy: http://0.0.0.0:${listenPort} -> http://${upstreamHost}:${upstreamPort}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)))
}
