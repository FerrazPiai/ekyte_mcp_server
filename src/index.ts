#!/usr/bin/env node
/**
 * Ekyte MCP Server
 *
 * MCP server that enables AI assistants (Claude, etc.) to interact with the
 * Ekyte platform for task management and time tracking.
 *
 * Supports two transport modes:
 * - stdio: for local/desktop use (Claude Desktop, Claude Code)
 * - http: for remote/server use (EasyPanel, cloud deployment)
 *
 * Environment variables required:
 * - EKYTE_BEARER_TOKEN: Bearer Token master (used for ALL requests)
 * - EKYTE_COMPANY_ID: Numeric company ID in Ekyte
 * - TRANSPORT: 'stdio' (default) or 'http'
 * - PORT: Server port for HTTP mode (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { Request, Response, NextFunction } from "express";

import { registerReadTools } from "./tools/read-tools.js";
import { registerWriteTools } from "./tools/write-tools.js";

// ============ Global error handlers (prevent silent crash) ============

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
});

// ============ Helper: create a fully configured MCP server ============

function createServer(): McpServer {
  const s = new McpServer({
    name: "ekyte-mcp-server",
    version: "1.0.0",
  });
  registerReadTools(s);
  registerWriteTools(s);
  return s;
}

// ============ Transport: stdio ============

async function runStdio(): Promise<void> {
  validateEnv();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ekyte MCP Server running via stdio");
}

// ============ Transport: Streamable HTTP ============

async function runHTTP(): Promise<void> {
  validateEnv();

  const app = express();
  app.use(express.json({ limit: "4mb" }));

  // Access log
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  // CORS
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
    res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
    next();
  });

  app.options("/mcp", (_req: Request, res: Response) => {
    res.status(204).end();
  });

  // Root — so EasyPanel probes / upstream pings don't flood logs with 404
  app.get("/", (_req: Request, res: Response) => {
    res.json({ server: "ekyte-mcp-server", status: "ok", endpoint: "/mcp", health: "/health" });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: "ekyte-mcp-server", version: "1.0.0" });
  });

  // MCP endpoint — stateless mode: new server + transport per request
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      res.on("close", () => {
        try {
          transport.close();
          server.close();
        } catch {
          /* ignore */
        }
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("[mcp] handler error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "SSE not supported in stateless mode. Use POST." },
      id: null,
    });
  });

  app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session termination not supported in stateless mode." },
      id: null,
    });
  });

  // Express error fallback
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[express] unhandled:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  const httpServer = app.listen(port, "0.0.0.0", () => {
    console.error(`Ekyte MCP Server running on http://0.0.0.0:${port}/mcp`);
    console.error(`Health check: http://0.0.0.0:${port}/health`);
  });

  // Graceful shutdown so EasyPanel restarts don't leave dangling sockets
  const shutdown = (signal: string) => {
    console.error(`[signal] ${signal} received, closing http server...`);
    httpServer.close(() => {
      console.error("[signal] http server closed, exiting.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============ Environment Validation ============

function validateEnv(): void {
  const required = ["EKYTE_BEARER_TOKEN", "EKYTE_COMPANY_ID"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`ERRO: Variáveis de ambiente obrigatórias não definidas: ${missing.join(", ")}`);
    console.error("");
    console.error("Configure as seguintes variáveis:");
    console.error("  EKYTE_BEARER_TOKEN   - Bearer Token (JWT) do Ekyte");
    console.error("  EKYTE_COMPANY_ID     - ID numérico da empresa no Ekyte");
    console.error("");
    console.error("Opcionais:");
    console.error("  TRANSPORT            - 'stdio' (padrão) ou 'http'");
    console.error("  PORT                 - Porta do servidor HTTP (padrão: 3000)");
    process.exit(1);
  }
}

// ============ Main ============

const transport = process.env.TRANSPORT || "stdio";

if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Erro fatal no servidor:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Erro fatal no servidor:", error);
    process.exit(1);
  });
}
