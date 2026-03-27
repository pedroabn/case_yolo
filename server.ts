import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand,
  QueryCommand
} from "@aws-sdk/lib-dynamodb";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AWS Configuration
  const useDynamo = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
  
  let ddbDocClient: any = null;
  if (useDynamo) {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    ddbDocClient = DynamoDBDocumentClient.from(client);
    console.log("Using real DynamoDB");
  } else {
    console.log("Using in-memory mock database (AWS credentials not found)");
  }

  // In-memory fallback
  let people: any[] = [];

  // Helper to generate 12-digit numeric ID
  const generateNumericId = () => {
    return Math.floor(Math.random() * 900000000000 + 100000000000).toString();
  };

  const normalizePhone = (phone: string) => {
    if (!phone) return "";
    return phone.replace(/\D/g, '').slice(0, 11);
  };

  const checkEmailExists = async (email: string, excludeId?: string) => {
    if (!useDynamo) {
      return people.some(p => p.email === email && p.id !== excludeId);
    }
    try {
      const response = await ddbDocClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "EmailIndex",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email }
      }));
      const items = response.Items || [];
      return items.some((item: any) => item.id !== excludeId);
    } catch (error: any) {
      // If index is missing, fallback to Scan (less efficient but avoids crash)
      if (error.name === "ResourceNotFoundException" || error.message.toLowerCase().includes("index")) {
        const response = await ddbDocClient.send(new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "email = :email",
          ExpressionAttributeValues: { ":email": email }
        }));
        const items = response.Items || [];
        return items.some((item: any) => item.id !== excludeId);
      }
      throw error;
    }
  };

  // Initial Import Logic
  const performInitialImport = async () => {
    try {
      console.log("Performing initial import from external API...");
      const response = await axios.get("https://3ji5haxzr9.execute-api.us-east-1.amazonaws.com/dev/caseYolo");
      const data = typeof response.data.body === 'string' ? JSON.parse(response.data.body) : response.data.body;
      const clientes = data.clientes || [];

      for (const c of clientes) {
        const email = c["E-mail"];
        const normalized = {
          id: generateNumericId(),
          nome: c.Nome,
          telefone: normalizePhone(c.Telefone),
          email: email,
          tipo: c.Tipo,
          dataCadastro: c["Data de Cadastro"] || new Date().toISOString().split('T')[0],
          cep: "",
          foto: ""
        };

        if (useDynamo) {
          try {
            const exists = await checkEmailExists(email);
            if (!exists) {
              await ddbDocClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: normalized
              }));
            }
          } catch (e: any) {
            console.error("Error saving to DynamoDB during import:", e.message);
          }
        } else {
          if (!people.find((p) => p.email === email)) {
            people.push(normalized);
          }
        }
      }
      console.log("Initial import completed.");
    } catch (error) {
      console.error("Initial import failed:", error);
    }
  };

  // Run import on startup
  performInitialImport();

  // API Routes
  app.get("/api/people", async (req, res) => {
    const { type, search } = req.query;
    let results = [];

    if (useDynamo) {
      try {
        const response = await ddbDocClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        results = response.Items || [];
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    } else {
      results = [...people];
    }

    // Filter by type
    if (type && type !== "Todos") {
      results = results.filter((p: any) => p.tipo === type);
    }

    // Filter by name (search)
    if (search) {
      const searchStr = String(search).toLowerCase();
      results = results.filter((p: any) => p.nome.toLowerCase().includes(searchStr));
    }

    res.json(results);
  });

  app.post("/api/people", async (req, res) => {
    const person = req.body;
    person.id = generateNumericId();
    person.dataCadastro = new Date().toISOString().split('T')[0];
    person.telefone = normalizePhone(person.telefone);

    try {
      const exists = await checkEmailExists(person.email);
      if (exists) {
        return res.status(400).json({ message: "E-mail já cadastrado para outro usuário." });
      }

      if (useDynamo) {
        await ddbDocClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: person
        }));
      } else {
        people.push(person);
      }
      res.status(201).json(person);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/people/:id", async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    if (updateData.telefone) updateData.telefone = normalizePhone(updateData.telefone);

    try {
      // If email is being updated, check uniqueness
      if (updateData.email) {
        const exists = await checkEmailExists(updateData.email, id);
        if (exists) {
          return res.status(400).json({ message: "Este e-mail já está em uso por outro usuário." });
        }
      }

      if (useDynamo) {
        const updateExprParts: string[] = [];
        const attrValues: any = {};
        const attrNames: any = {};

        Object.keys(updateData).forEach((key) => {
          if (key !== 'id' && key !== 'dataCadastro') {
            updateExprParts.push(`#${key} = :${key}`);
            attrValues[`:${key}`] = updateData[key];
            attrNames[`#${key}`] = key;
          }
        });

        if (updateExprParts.length === 0) return res.json({ message: "No fields to update" });

        const response = await ddbDocClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression: `set ${updateExprParts.join(", ")}`,
          ExpressionAttributeValues: attrValues,
          ExpressionAttributeNames: attrNames,
          ReturnValues: "ALL_NEW"
        }));
        res.json(response.Attributes);
      } else {
        const index = people.findIndex((p) => p.id === id);
        if (index === -1) return res.status(404).json({ message: "Pessoa não encontrada." });
        
        people[index] = { ...people[index], ...updateData };
        res.json(people[index]);
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/people/:id", async (req, res) => {
    const { id } = req.params;

    if (useDynamo) {
      try {
        await ddbDocClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id }
        }));
        res.status(204).send();
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    } else {
      people = people.filter((p) => p.id !== id);
      res.status(204).send();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
