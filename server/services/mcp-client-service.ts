/**
 * MCP Client Service
 * Manages connections to MCP servers and tool execution
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPServerConfig, MCPToolDefinition, MCPServerConnection } from '@shared/types/mcp-types';

class MCPClientService {
  private connections: Map<string, MCPServerConnection> = new Map();
  private connectionTTL = 5 * 60 * 1000; // 5 minutes
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Get or create a connection to an MCP server
   */
  async getOrCreateConnection(config: MCPServerConfig): Promise<MCPServerConnection> {
    const existingConnection = this.connections.get(config.id);
    

    if (existingConnection) {
      const timeSinceLastUse = Date.now() - existingConnection.lastUsedAt.getTime();
      if (timeSinceLastUse < this.connectionTTL) {
        existingConnection.lastUsedAt = new Date();
        return existingConnection;
      } else {

        await this.disconnectServer(config.id);
      }
    }


    return await this.connectToServer(config);
  }

  /**
   * Connect to an MCP server
   */
  async connectToServer(config: MCPServerConfig): Promise<MCPServerConnection> {
    try {
      let client: Client;
      let transport: StdioClientTransport | StreamableHTTPClientTransport;

      if (config.transport === 'stdio') {
        if (!config.command) {
          throw new Error('Command is required for stdio transport');
        }

        const args = config.args || [];

        const processEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            processEnv[key] = value;
          }
        }
        const env = { ...processEnv, ...(config.env || {}) };


        transport = new StdioClientTransport({
          command: config.command,
          args,
          env
        });

        client = new Client({
          name: config.name || 'powerchat-mcp-client',
          version: '1.0.0'
        }, {
          capabilities: {
            tools: {}
          }
        });


        await client.connect(transport);

      } else if (config.transport === 'http') {
        if (!config.url) {
          throw new Error('URL is required for HTTP transport');
        }


        transport = new StreamableHTTPClientTransport(new URL(config.url));

        client = new Client({
          name: config.name || 'powerchat-mcp-client',
          version: '1.0.0'
        }, {
          capabilities: {
            tools: {}
          }
        });


        await client.connect(transport);

      } else {
        throw new Error(`Unsupported transport type: ${config.transport}`);
      }


      const tools = await this.discoverTools(config.id);

      const connection: MCPServerConnection = {
        id: config.id,
        config,
        client,
        transport,
        tools,
        connectedAt: new Date(),
        lastUsedAt: new Date()
      };

      this.connections.set(config.id, connection);


      return connection;

    } catch (error) {
      console.error(`[MCP] Failed to connect to server ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Discover tools from an MCP server
   */
  async discoverTools(serverId: string): Promise<MCPToolDefinition[]> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverId}`);
    }

    try {
      const toolsResponse = await connection.client.listTools();
      connection.lastUsedAt = new Date();

      const tools: MCPToolDefinition[] = (toolsResponse.tools || []).map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as any
      }));


      connection.tools = tools;
      

      return tools;

    } catch (error) {
      console.error(`[MCP] Failed to discover tools from server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a tool call on an MCP server
   */
  async executeToolCall(
    serverId: string,
    toolName: string,
    arguments_: Record<string, any>
  ): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverId}`);
    }

    const timeout = connection.config.timeout || this.defaultTimeout;

    try {
      connection.lastUsedAt = new Date();


      const result = await Promise.race([
        connection.client.callTool({
          name: toolName,
          arguments: arguments_
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
        )
      ]);

      


      if (result && typeof result === 'object' && 'content' in result) {
        const content = (result as any).content;
        if (Array.isArray(content) && content.length > 0) {

          if (content.length === 1) {
            return content[0].text || content[0];
          }
          return content.map((item: any) => item.text || item).join('\n');
        }
      }

      return result;

    } catch (error) {
      console.error(`[MCP] Failed to execute tool ${toolName} on server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    try {
      await connection.client.close();
      this.connections.delete(serverId);
      
    } catch (error) {
      console.error(`[MCP] Error disconnecting from server ${serverId}:`, error);
      this.connections.delete(serverId);
    }
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    const serverIds = Array.from(this.connections.keys());
    await Promise.all(serverIds.map(id => this.disconnectServer(id)));
  }

  /**
   * Clean up expired connections
   */
  cleanupExpiredConnections(): void {
    const now = Date.now();
    for (const [id, connection] of this.connections.entries()) {
      const timeSinceLastUse = now - connection.lastUsedAt.getTime();
      if (timeSinceLastUse >= this.connectionTTL) {
        this.disconnectServer(id).catch(err => {
          console.error(`[MCP] Error cleaning up expired connection ${id}:`, err);
        });
      }
    }
  }

  /**
   * Get connection status for a server
   */
  getConnectionStatus(serverId: string): 'connected' | 'disconnected' | 'error' {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return 'disconnected';
    }

    return 'connected';
  }
}


const mcpClientService = new MCPClientService();


setInterval(() => {
  mcpClientService.cleanupExpiredConnections();
}, 60 * 1000);


process.on('SIGTERM', () => {
  mcpClientService.shutdown();
});

process.on('SIGINT', () => {
  mcpClientService.shutdown();
});

export default mcpClientService;

