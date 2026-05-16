#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from "inquirer";
import { blueprintLoader } from '../../blueprint/index.js';

/**
 * Resolve frontend/backend directory names via the architecture blueprint.
 * Single source of truth — shared with core/generator.js, no duplicated candidate lists.
 */
export async function getConfigPaths(projectRoot) {
  const blueprint = await blueprintLoader.load(projectRoot);
  return {
    frontendDir: blueprint.resolveRoot('frontend', projectRoot),
    backendDir: blueprint.resolveRoot('backend', projectRoot),
  };
}

export default async function generatePageCmd(name, options) {
  console.warn(
    chalk.yellow(
      "⚠  'generate page' is superseded by 'loom generate resource --recipe page'\n" +
        "   (engine-backed: recipe-driven, transactional, validated). This command still works.",
    ),
  );
  const spinner = ora();
  const projectRoot = process.cwd();
  const { frontendDir, backendDir } = await getConfigPaths(projectRoot);

  if (!fs.existsSync(path.join(projectRoot, frontendDir, 'src/App.jsx'))) {
    console.log(chalk.red('✖  Not a MERN Starter Kit frontend.'));
    process.exit(1);
  }

  const isDashboard = name.toLowerCase() === "dashboard";
  const pageName = isDashboard ? "Dashboard" : (name.charAt(0).toUpperCase() + name.slice(1));
  const pageDir = path.join(projectRoot, frontendDir, 'src/pages', isDashboard ? "dashboard" : name);
  const pageFile = path.join(pageDir, `${pageName}Page.jsx`);

  if (fs.existsSync(pageFile)) {
    if (options.force) {
      spinner.warn(`${pageFile} exists — will overwrite (--force)`);
    } else {
      console.log(chalk.yellow(`⚠  Page ${pageName} already exists. Use --force to overwrite.`));
      process.exit(1);
    }
  }

  await fs.ensureDir(pageDir);

  let formFields = [];
  let formMode = "page";
  if (options.withForm) {
    formMode = options.formMode || "page";
    if (options.formFields) {
      formFields = parseFormFields(options.formFields);
    } else if (options.interactive) {
      formFields = await askFormFields();
    } else {
      formFields = [{ name: "name", type: "text", label: "Name", required: true }];
    }
  }

  let pageContent;
  if (isDashboard) {
    pageContent = generateDashboardPage(pageName);
  } else {
    pageContent = generatePageComponent(pageName, name, formFields, formMode);

    if (formFields.length > 0) {
      const formDir = path.join(pageDir, "components");
      await fs.ensureDir(formDir);
      const formFile = path.join(formDir, `${pageName}Form.jsx`);
      const formContent = generateFormComponent(pageName, formFields);
      await fs.writeFile(formFile, formContent);
      spinner.succeed(`Created form component: ${formFile}`);
    }
  }

  await fs.writeFile(pageFile, pageContent);
  spinner.succeed(`Created page: ${pageFile}`);

  const routerPath = path.join(projectRoot, frontendDir, 'src/routes/AppRouter.jsx');
  if (fs.existsSync(routerPath)) {
    await updateRouter(routerPath, pageName, isDashboard ? "dashboard" : name, options.route, spinner);
  } else {
    console.log(chalk.yellow("⚠  AppRouter.jsx not found — add route manually."));
  }

  if (!options.noNav) {
    await updateNavigation(path.join(projectRoot, frontendDir, 'src/config/app-preset.js'), pageName, options.route || `/${isDashboard ? "dashboard" : name}`, options.icon, spinner);
  }
}

/**
 * Parse page form field specification
 * Format: "name:type:rule1|rule2;name2:type2:ruleA|ruleB"
 */
export function parseFormFields(str) {
  if (!str || typeof str !== "string") return [];
  
  return str.split(";").map(fieldPart => {
    const parts = fieldPart.split(":");
    const name = parts[0]?.trim();
    const type = (parts[1] || "text").trim();
    const rulesPart = parts[2]?.trim() || "";
    
    if (!name) return null;
    
    const field = { name, type, label: name.charAt(0).toUpperCase() + name.slice(1) };
    
    if (rulesPart) {
      const rules = rulesPart.split("|");
      rules.forEach(rule => {
        const [key, value] = rule.split("=").map(s => s.trim());
        if (!value && key === "required") {
          field.required = true;
        } else if (!value && key === "unique") {
          field.unique = true;
        } else if (value) {
          const num = parseFloat(value);
          field[key] = isNaN(num) ? value : num;
        }
      });
      if (field.default !== undefined) {
        field.defaultValue = field.default;
      }
    }
    
    return field;
  }).filter(Boolean);
}

export async function askFormFields() {
  const { continueAdding } = await inquirer.prompt([
    { type: "confirm", name: "continueAdding", message: "Add form fields?", default: true },
  ]);
  
  const fields = [];
  while (continueAdding) {
    const answers = await inquirer.prompt([
      { 
        type: "input", 
        name: "name", 
        message: "Field name:",
        validate: (v) => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v) || "Valid JS identifier required" 
      },
      { 
        type: "list", 
        name: "type", 
        message: "Field type:",
        choices: [
          { name: "Text (single line)", value: "text" },
          { name: "Email", value: "email" },
          { name: "Password", value: "password" },
          { name: "Number", value: "number" },
          { name: "Phone", value: "tel" },
          { name: "URL", value: "url" },
          { name: "Date", value: "date" },
          { name: "DateTime", value: "datetime-local" },
          { name: "Time", value: "time" },
          { name: "Textarea", value: "textarea" },
          { name: "Color", value: "color" },
          { name: "Range", value: "range" },
          { name: "File", value: "file" },
          { name: "Hidden", value: "hidden" },
        ],
      },
      { 
        type: "input", 
        name: "label", 
        message: "Label (optional):",
        default: (prev) => prev.name.charAt(0).toUpperCase() + prev.name.slice(1) 
      },
      {
        type: "checkbox",
        name: "validation",
        message: "Validation rules:",
        choices: [
          { name: "Required", value: "required", checked: true },
          { name: "Unique", value: "unique", checked: false },
        ]
      },
      {
        type: "input",
        name: "minLength",
        message: "Min length (optional):",
        validate: (v) => !v || /^\d+$/.test(v) || "Enter a number or leave empty"
      },
      {
        type: "input",
        name: "maxLength",
        message: "Max length (optional):",
        validate: (v) => !v || /^\d+$/.test(v) || "Enter a number or leave empty"
      },
      {
        type: "input",
        name: "minValue",
        message: "Min value (for numbers/dates):",
        validate: (v) => !v || !isNaN(v) || "Enter a number/date or leave empty"
      },
      {
        type: "input",
        name: "maxValue",
        message: "Max value (for numbers/dates):",
        validate: (v) => !v || !isNaN(v) || "Enter a number/date or leave empty"
      },
      {
        type: "input",
        name: "pattern",
        message: "Regex pattern (e.g., /^[A-Z]+$/):",
        validate: (v) => !v || v.startsWith("/") || "Enter regex like /^[A-Z]+$/ or leave empty"
      },
      {
        type: "input",
        name: "placeholder",
        message: "Placeholder text (optional):"
      },
      {
        type: "input",
        name: "helperText",
        message: "Helper/instructions text (optional):"
      },
    ]);
    
    const field = {
      name: answers.name,
      type: answers.type,
      label: answers.label,
      required: answers.validation.includes("required"),
      unique: answers.validation.includes("unique"),
      placeholder: answers.placeholder,
      helperText: answers.helperText,
    };
    
    if (answers.minLength) field.minLength = parseInt(answers.minLength);
    if (answers.maxLength) field.maxLength = parseInt(answers.maxLength);
    if (answers.minValue !== undefined && answers.minValue !== "") field.min = parseFloat(answers.minValue);
    if (answers.maxValue !== undefined && answers.maxValue !== "") field.max = parseFloat(answers.maxValue);
    if (answers.pattern) field.pattern = answers.pattern;
    
    if (field.type === "range") {
      field.min = field.min ?? 0;
      field.max = field.max ?? 100;
      field.step = field.step ?? 1;
    }
    
    fields.push(field);
    const { more } = await inquirer.prompt([{ type: "confirm", name: "more", message: "Add another field?", default: false }]);
    if (!more) break;
  }
  return fields;
}

function singularize(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  // Words ending in ch, sh, ss, s, x, z, o + es -> remove 'es'
  if (word.endsWith('es') && word.length > 2) {
    const stem = word.slice(0, -2); // remove 'es' to get stem
    if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') || stem.endsWith('o')) {
      return stem; // classes -> class, boxes -> box
    }
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

function generatePageComponent(pageName, routeName, formFields, formMode = "page") {
  const formComponentName = `${pageName}Form`;
  const singularName = singularize(pageName);

  const pageImports = formFields.length ?
    `import { ${formComponentName} } from "./components/${formComponentName}";\n` : "";

  // Helper data for table and list
  const displayFields = formFields.filter(f => !['file', 'hidden', 'password'].includes(f.type));
  const tableHeaders = displayFields.map(f => 
    `        <TableHead>${f.label || f.name.charAt(0).toUpperCase() + f.name.slice(1)}</TableHead>`
  ).join('\n');
  const tableCells = displayFields.map(f => 
    '                  <TableCell>{String(item.' + f.name + ' || "")}</TableCell>'
  ).join('\n');

  const dropdownActions = `          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleEdit(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDelete(item._id || item.id)} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>`;

  const simpleActions = `                  <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(item)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(item._id || item.id)}>Delete</Button>
                      </div>`;

  if (formMode === "modal") {
    const modalImports = `import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/api/axiosInstance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
${pageImports}`;

    return `${modalImports}export default function ${pageName}Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/${pageName.toLowerCase()}");
      setItems(data?.data || []);
    } catch (err) {
      toast.error("Failed to load ${singularName.toLowerCase()}s");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id || item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this ${singularName.toLowerCase()}?")) return;
    try {
      await api.delete(\`/${pageName.toLowerCase()}/\${id}\`);
      toast.success("${singularName} deleted successfully");
      fetchItems();
    } catch (err) {
      toast.error("Failed to delete ${singularName.toLowerCase()}");
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingId(null);
    fetchItems();
  };

  return (
    <PageWrapper className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">${pageName}</h1>
        <p className="text-muted-foreground">Manage ${routeName.toLowerCase()} here.</p>
      </section>

      <section>
        <Button onClick={() => { setEditingId(null); setShowForm(true); }}>
          Add New ${singularName}
        </Button>
      </section>

      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">All Items</h2>
        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No ${singularName.toLowerCase()}s yet. Click "Add New ${singularName}" to get started.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
${tableHeaders}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id || item.id}>
${tableCells}
                  <TableCell className="text-right">
                    ${dropdownActions}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit ${singularName}" : "Create ${singularName}"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the details below." : "Fill in the details below to create a new ${singularName.toLowerCase()}."}
            </DialogDescription>
          </DialogHeader>
          <${formComponentName} onSuccess={handleSuccess} editId={editingId} />
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
`;
  }

  if (formMode === "sidepanel") {
    const sidepanelImports = `import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { api } from "@/api/axiosInstance";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
${pageImports}`;

    return `${sidepanelImports}export default function ${pageName}Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/${pageName.toLowerCase()}");
      setItems(data?.data || []);
    } catch (err) {
      toast.error("Failed to load ${singularName.toLowerCase()}s");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id || item.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this ${singularName.toLowerCase()}?")) return;
    try {
      await api.delete(\`/${pageName.toLowerCase()}/\${id}\`);
      toast.success("${singularName} deleted successfully");
      fetchItems();
    } catch (err) {
      toast.error("Failed to delete ${singularName.toLowerCase()}");
    }
  };

  const handleSuccess = () => {
    setShowForm(false);
    setEditingId(null);
    fetchItems();
  };

  return (
    <PageWrapper className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">${pageName}</h1>
        <p className="text-muted-foreground">Manage ${routeName.toLowerCase()} here.</p>
      </section>

      <section>
        <Button onClick={() => { setEditingId(null); setShowForm(true); }}>
          Add New ${singularName}
        </Button>
      </section>

      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">All Items</h2>
        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No ${singularName.toLowerCase()}s yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item._id || item.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  ${displayFields.length ? displayFields.map(f => '<span className="font-medium">' + f.label + ':</span> {String(item.' + f.name + ' || "")}').join(' — ') : item._id || item.id}
                </div>
                ${simpleActions}
              </div>
            ))}
          </div>
        )}
      </section>

      <Sheet open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingId(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit ${singularName}" : "Create ${singularName}"}</SheetTitle>
            <SheetDescription>
              {editingId ? "Update the details below." : "Fill in the details below to create a new ${singularName.toLowerCase()}."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <${formComponentName} onSuccess={handleSuccess} editId={editingId} />
          </div>
        </SheetContent>
      </Sheet>
    </PageWrapper>
  );
}
`;
  }

  if (formMode === "inline") {
    const inlineImports = `import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { api } from "@/api/axiosInstance";
${pageImports}`;

    return `${inlineImports}export default function ${pageName}Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/${pageName.toLowerCase()}");
      setItems(data?.data || []);
    } catch (err) {
      toast.error("Failed to load ${singularName.toLowerCase()}s");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this ${singularName.toLowerCase()}?")) return;
    try {
      await api.delete(\`/${pageName.toLowerCase()}/\${id}\`);
      toast.success("${singularName} deleted successfully");
      fetchItems();
    } catch (err) {
      toast.error("Failed to delete ${singularName.toLowerCase()}");
    }
  };

  const handleSuccess = () => {
    setEditingId(null);
    fetchItems();
  };

  return (
    <PageWrapper className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">${pageName}</h1>
        <p className="text-muted-foreground">Manage ${routeName.toLowerCase()} here.</p>
      </section>

      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">Create New</h2>
        <${formComponentName} onSuccess={handleSuccess} editId={editingId} />
      </section>

      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">All Items</h2>
        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No ${singularName.toLowerCase()}s yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item._id || item.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  ${displayFields.length ? displayFields.map(f => '<span className="font-medium">' + f.label + ':</span> {String(item.' + f.name + ' || "")}').join(' — ') : item._id || item.id}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(item._id || item.id); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(item._id || item.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageWrapper>
  );
}
`;
  }

  // Default: page mode
  const pageImportsWithEffects = pageImports ? 
    `import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/api/axiosInstance";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
${pageImports}` :
    `import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/api/axiosInstance";
import { useAuth } from "@/hooks/useAuth";
import { ROUTES } from "@/utils/constants";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
${pageImports}`;

  return `${pageImportsWithEffects}export default function ${pageName}Page() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  ${pageImports ? '' : 'const { user } = useAuth();'}

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/${pageName.toLowerCase()}");
      setItems(data?.data || []);
    } catch (err) {
      toast.error("Failed to load ${singularName.toLowerCase()}s");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this ${singularName.toLowerCase()}?")) return;
    try {
      await api.delete(\`/${pageName.toLowerCase()}/\${id}\`);
      toast.success("${singularName} deleted successfully");
      fetchItems();
    } catch (err) {
      toast.error("Failed to delete ${singularName.toLowerCase()}");
    }
  };

  const handleSuccess = () => {
    setEditingId(null);
    fetchItems();
  };

  return (
    <PageWrapper className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">${pageName}</h1>
        <p className="text-muted-foreground">Manage ${routeName.toLowerCase()} here.</p>
      </section>

      ${formFields.length ? `
      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">Create New</h2>
        <${formComponentName} onSuccess={handleSuccess} editId={editingId} />
      </section>` : ''}

      <section className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-medium mb-4">All Items</h2>
        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">No ${singularName.toLowerCase()}s yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
${tableHeaders}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item._id || item.id}>
${tableCells}
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(item._id || item.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(item._id || item.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </PageWrapper>
  );
}
`;
}
export function generateDashboardPage(pageName, modules = []) {
  const hasModules = modules.length > 0;
  const moduleRefs = modules.map(m => m.name).join(', ');
  const fetchStatsPromises = modules.map(m => `api.get("/api/${m.name}").then(r => r.data?.data?.length || 0)`).join(', ');

  return `import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/api/axiosInstance";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Link } from "react-router-dom";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const fetchStats = async () => {
  const promises = [${fetchStatsPromises || 'Promise.resolve(0)'}];
  const results = await Promise.all(promises);
  return { ${modules.map((m, i) => `${m.name}: results[${i}]`).join(', ')} };
};

const fetchActivity = async ({ queryKey }) => {
  const [_key, page] = queryKey;
  const responses = await Promise.all([
    ${modules.slice(0, 3).map(m => `api.get("/api/${m.name}?limit=5&skip=" + page * 5)`).join(',\n    ')}
  ]);
  return responses.flatMap((r, i) =>
    (r.data?.data || []).map(item => ({ ...item, module: "${modules[0]?.name || 'item'}" }))
  ).slice(0, 10);
};

export default function ${pageName}Page() {
  const [activityPage, setActivityPage] = useState(0);
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard-activity", activityPage],
    queryFn: fetchActivity,
  });

  return (
    <PageWrapper className="space-y-6">
      <section>
        <h1 className="text-3xl font-semibold">${pageName}</h1>
        <p className="text-muted-foreground">Overview of your application metrics.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        ${hasModules ? modules.map(m => `
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">${m.name.charAt(0).toUpperCase() + m.name.slice(1)}</CardTitle>
            <span className="text-2xl">📊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsLoading ? "..." : stats?.${m.name} ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total records</p>
          </CardContent>
        </Card>`).join('\n') : `
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No modules detected. Generate modules to see stats.</p>
            <Button asChild className="mt-2">
              <Link to="/modules">View Modules</Link>
            </Button>
          </CardContent>
        </Card>`}
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <>
                <div className="rounded-md border">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left">Module</th>
                        <th className="p-2 text-left">Action</th>
                        <th className="p-2 text-left">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity?.slice(0, 10).map((item, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-2">{item.module}</td>
                          <td className="p-2">Updated</td>
                          <td className="p-2">{new Date().toLocaleDateString()}</td>
                        </tr>
                      )) || <tr><td className="p-2" colSpan={3}>No recent activity</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActivityPage(p => Math.max(0, p - 1))}
                    disabled={activityPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {activityPage + 1}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActivityPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </PageWrapper>
  );
}
`;
}

function generateFormComponent(pageName, fields) {
   const fieldInputs = fields.filter(f => f.type !== 'hidden').map((field) => {
    const id = field.name.toLowerCase();
    const label = field.label || field.name.charAt(0).toUpperCase() + field.name.slice(1);
    const required = field.required ? "required" : "";
    const placeholder = field.placeholder ? `placeholder="${field.placeholder}"` : "";
    const helperText = field.helperText ? `<p className="text-xs text-muted-foreground mt-1">${field.helperText}</p>` : "";

    let validationAttrs = "";
    if (field.type === "number" || field.type === "range") {
      if (field.min !== undefined) validationAttrs += ` min="${field.min}"`;
      if (field.max !== undefined) validationAttrs += ` max="${field.max}"`;
      if (field.step) validationAttrs += ` step="${field.step}"`;
    }
    if (field.type === "text" || field.type === "string") {
      if (field.minLength !== undefined) validationAttrs += ` minLength="${field.minLength}"`;
      if (field.maxLength !== undefined) validationAttrs += ` maxLength="${field.maxLength}"`;
    }

     let inputElement;
     switch (field.type) {
        case "textarea":
          inputElement = `<textarea
            id="${id}"
            name="${id}"
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${placeholder}
            ${validationAttrs}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "select":
          inputElement = `<select
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            onChange={handleChange}
            value={values.${field.name}}
          >
            <option value="">Select...</option>
            {field.options?.map(opt => '<option value="' + (opt.value || opt) + '">' + (opt.label || opt) + '</option>').join("\\n          ") || ""}
          </select>`;
          break;

        case "color":
          inputElement = `<div className="flex items-center gap-2">
            <input
              type="color"
              id="${id}"
              name="${id}"
              className="h-10 w-20 rounded-md border cursor-pointer"
              onChange={handleChange}
              value={values.${field.name}}
            />
            <input type="text" readOnly value="#000000" className="flex-1 rounded-md border px-3 py-2 text-sm bg-muted" />
          </div>`;
          break;

       case "file":
         inputElement = `<input
           type="file"
           id="${id}"
           name="${id}"
           className="w-full rounded-md border px-3 py-2 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
           accept="${field.accept || "*/*"}"
           ${field.multiple ? "multiple" : ""}
         />`;
         break;

        case "range":
          inputElement = `<div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span>${field.min || 0}</span>
              <span id="${id}-display" className="font-medium">${field.defaultValue || Math.round((field.min || 0) + (field.max || 100) / 2)}</span>
              <span>${field.max || 100}</span>
            </div>
            <input
              type="range"
              id="${id}"
              name="${id}"
              min="${field.min || 0}"
              max="${field.max || 100}"
              step="${field.step || 1}"
              className="w-full accent-primary"
              onChange={(e) => {
                handleChange(e);
                document.getElementById('${id}-display').textContent = e.target.value;
              }}
              value={values.${field.name}}
            />
          </div>`;
          break;

        case "hidden":
          inputElement = `<input type="hidden" id="${id}" name="${id}" value={values.${field.name}} />`;
          break;

        case "date":
          inputElement = `<input
            type="date"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${field.min ? `min="${field.min}"` : ''}
            ${field.max ? `max="${field.max}"` : ''}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "time":
          inputElement = `<input
            type="time"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "datetime-local":
          inputElement = `<input
            type="datetime-local"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${field.min ? `min="${field.min}"` : ''}
            ${field.max ? `max="${field.max}"` : ''}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "tel":
          inputElement = `<input
            type="tel"
            id="${id}"
            name="${id}"
            inputMode="tel"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${placeholder}
            pattern="^[+]?[1-9]\\d{1,14}$"
            title="E.164 format: +[country code][number]"
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "url":
          inputElement = `<input
            type="url"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${placeholder}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "email":
          inputElement = `<input
            type="email"
            id="${id}"
            name="${id}"
            inputMode="email"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${placeholder}
            autoComplete="email"
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "password":
          inputElement = `<input
            type="password"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            minLength="8"
            autoComplete="${field.name.toLowerCase().includes('current') ? 'current-password' : 'new-password'}"
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "number":
          inputElement = `<input
            type="number"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${field.min !== undefined ? `min="${field.min}"` : ''}
            ${field.max !== undefined ? `max="${field.max}"` : ''}
            ${field.step ? `step="${field.step}"` : ''}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
          break;

        case "boolean":
          inputElement = `<div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="${id}"
              name="${id}"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
              ${required ? 'required' : ''}
              onChange={handleChange}
              checked={values.${field.name}}
            />
            <label htmlFor="${id}" className="text-sm font-medium">${field.label || ''}</label>
          </div>`;
          break;

        default:
          inputElement = `<input
            type="text"
            id="${id}"
            name="${id}"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            ${required}
            ${placeholder}
            ${validationAttrs}
            onChange={handleChange}
            value={values.${field.name}}
          />`;
      }

    return `      <div key="${id}" className="space-y-2">
        <label htmlFor="${id}" className="block text-sm font-medium">
          ${label}${field.required ? '<span className="text-destructive ml-1">*</span>' : ''}
        </label>
        ${inputElement}
        ${helperText}
      </div>`;
  }).join("\n\n");

  const formFieldsObject = fields.map((f) => {
    let defaultValue = '""';
    switch (f.type) {
      case "hidden": defaultValue = f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : '""'; break;
      case "number":
      case "range": defaultValue = f.defaultValue ?? 0; break;
      case "boolean": defaultValue = f.defaultValue ?? false; break;
      case "date":
      case "datetime-local": defaultValue = f.defaultValue ?? '""'; break;
      case "text":
      case "string":
      case "email":
      case "tel":
      case "url":
      case "password":
      case "textarea": defaultValue = f.defaultValue !== undefined ? JSON.stringify(f.defaultValue) : '""'; break;
    }
    return `      ${f.name}: ${defaultValue}`;
  }).join(",\n");

  const sanitizationImports = fields.some(f => ["email", "url", "tel", "text", "string"].includes(f.type))
    ? `import { sanitizeEmail, sanitizeUrl, sanitizePhone, sanitizeText } from "@/utils/sanitize";\n`
    : '';

  // Build validation blocks only for relevant fields, avoiding empty lines
  const requiredChecks = fields.filter(f => f.required).map(f => {
    if (f.type === 'boolean') {
      return `if (values.${f.name} !== true) errors.push("${f.label} is required");`;
    }
    return `if (values.${f.name} === undefined || values.${f.name} === null || values.${f.name} === '') errors.push("${f.label} is required");`;
  });

  const numberChecks = fields.filter(f => f.type === "number" || f.type === "range").flatMap(f => {
    const checks = [];
    if (f.min !== undefined) checks.push(`if (values.${f.name} !== undefined && values.${f.name} !== null && values.${f.name} < ${f.min}) errors.push("${f.label} must be >= ${f.min}");`);
    if (f.max !== undefined) checks.push(`if (values.${f.name} !== undefined && values.${f.name} !== null && values.${f.name} > ${f.max}) errors.push("${f.label} must be <= ${f.max}");`);
    return checks;
  });

  const lengthChecks = fields.filter(f => (f.minLength || f.maxLength) && ["text", "textarea", "string", "email", "tel", "url", "password"].includes(f.type)).flatMap(f => {
    const checks = [];
    if (f.minLength) checks.push(`if (values.${f.name} && values.${f.name}.length < ${f.minLength}) errors.push("Min ${f.minLength} characters");`);
    if (f.maxLength) checks.push(`if (values.${f.name} && values.${f.name}.length > ${f.maxLength}) errors.push("Max ${f.maxLength} characters");`);
    return checks;
  });

  const patternChecks = fields.filter(f => f.pattern).map(f =>
    `if (!${f.pattern}.test(values.${f.name})) errors.push("${f.label} has invalid format");`
  );

  const emailChecks = fields.filter(f => f.type === "email").map(f =>
    `if (values.${f.name} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(values.${f.name})) errors.push("Invalid email");`
  );

  const urlChecks = fields.filter(f => f.type === "url").map(f =>
    `if (values.${f.name} && !/^https?:\\/\\//.test(values.${f.name})) errors.push("URL must start with http:// or https://");`
  );

  const telChecks = fields.filter(f => f.type === "tel").map(f =>
    `if (values.${f.name} && !/^[+]?[1-9]\\d{1,14}$/.test(values.${f.name})) errors.push("Invalid phone (E.164: +1234567890)");`
  );

  const validationBlocks = [
    ...requiredChecks,
    ...numberChecks,
    ...lengthChecks,
    ...patternChecks,
    ...emailChecks,
    ...urlChecks,
    ...telChecks,
  ];

  const validationCode = validationBlocks.length > 0
    ? `\n    ${validationBlocks.join('\n    ')}\n  `
    : '';

  const resetValues = fields.map(f => {
    if (["number","range","boolean"].includes(f.type) && f.defaultValue !== undefined) return `${f.name}: ${f.defaultValue}`;
    if (["text","string","email","tel","url","password","textarea"].includes(f.type) && f.defaultValue !== undefined) return `${f.name}: ${JSON.stringify(f.defaultValue)}`;
    if (["date","datetime-local"].includes(f.type) && f.defaultValue !== undefined) return `${f.name}: ${JSON.stringify(f.defaultValue)}`;
    return `${f.name}: ${f.type === "boolean" ? false : f.type === "number" || f.type === "range" ? 0 : '""'}`;
  }).join(", ");

   return `import { useState, useEffect } from "react";
 import { toast } from "sonner";
 import { Button } from "@/components/ui/button";
 import { api } from "@/api/axiosInstance";
 ${sanitizationImports}export function ${pageName}Form({ onSuccess, editId = null } = {}) {
   const [loading, setLoading] = useState(false);
   const [editing, setEditing] = useState(false);
   const [values, setValues] = useState({
 ${formFieldsObject}
   });

   // Load existing data when editing
   useEffect(() => {
     if (editId) {
       setEditing(true);
       const fetchData = async () => {
         try {
           const { data } = await api.get(\`/${pageName.toLowerCase()}/\${editId}\`);
           if (data?.data) {
             setValues(prev => ({ ...prev, ...data.data }));
           }
         } catch (err) {
           toast.error("Failed to load item");
           console.error(err);
         }
       };
       fetchData();
     }
   }, [editId]);

   const handleChange = (e) => {
     const { name, value, type, checked } = e.target;
     const val = type === 'checkbox' ? checked : value;
     setValues((prev) => ({ ...prev, [name]: val }));
   };

  const sanitizeInput = (key, value) => {
    switch (key) {
      ${fields.filter(f => ["email", "url", "tel", "text", "string"].includes(f.type)).map(f => {
        const sanitizers = { email: "Email", url: "Url", tel: "Phone", text: "Text", string: "Text" };
        return `case "${f.name}": return sanitize${sanitizers[f.type]}(value);`;
      }).join('\n      ')}
      default: return value;
    }
  };

  const validateForm = () => {
    const errors = [];${validationCode}
    return errors;
  };

   async function handleSubmit(e) {
     e.preventDefault();
     setLoading(true);

     try {
       const errors = validateForm();
       if (errors.length > 0) {
         errors.forEach(err => toast.error(err));
         setLoading(false);
         return;
       }

       const sanitizedData = Object.fromEntries(
         Object.entries(values).map(([k, v]) => [k, sanitizeInput(k, v)])
       );

       const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
       const config = {
         headers: {
           'Content-Type': 'application/json',
           ...(csrfToken && { 'X-CSRF-Token': csrfToken })
         }
       };

       if (editing && editId) {
         await api.put(\`/${pageName.toLowerCase()}/\${editId}\`, sanitizedData, config);
         toast.success("Item updated successfully!");
       } else {
         await api.post(\`/${pageName.toLowerCase()}\`, sanitizedData, config);
         toast.success("Item created successfully!");
       }
       
       setValues({${resetValues}});
       setEditing(false);
       if (onSuccess) onSuccess();
     } catch (err) {
       const errorMsg = err?.response?.data?.message || err?.message || "Failed to save";
       toast.error(errorMsg);
       if (process.env.NODE_ENV === 'development') console.error("Form error:", err);
     } finally {
       setLoading(false);
     }
   }

   async function handleDelete() {
     if (!editId) return;
     
     if (!confirm("Are you sure you want to delete this item?")) return;
     
     setLoading(true);
     try {
       await api.delete(\`/${pageName.toLowerCase()}/\${editId}\`);
       toast.success("Item deleted successfully!");
       setValues({${resetValues}});
       setEditing(false);
       if (onSuccess) onSuccess();
     } catch (err) {
       const errorMsg = err?.response?.data?.message || err?.message || "Failed to delete";
       toast.error(errorMsg);
     } finally {
       setLoading(false);
     }
   }


   return (
     <form onSubmit={handleSubmit} className="space-y-4">
 ${fieldInputs}
       ${fields.filter(f => f.type === "hidden").map(f => `      <input type="hidden" name="${f.name}" value={values.${f.name}} />`).join('\n')}
       {editing ? 
       <div className="pt-2 flex gap-2">
         <Button type="submit" disabled={loading}>
           {loading ? "Saving..." : "Update ${pageName}"}
         </Button>
         <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
           {loading ? "Deleting..." : "Delete"}
         </Button>
         <Button type="button" variant="outline" onClick={() => { setEditing(false); setValues({${resetValues}}); }}>
           Cancel
         </Button>
       </div> : 
       <div className="pt-2">
         <Button type="submit" disabled={loading}>
           {loading ? "Creating..." : "Create ${pageName}"}
         </Button>
       </div>}
     </form>
   );
 }
 `;
 }

async function updateRouter(routerPath, pageName, name, customRoute, spinner) {
  let routerCode = await fs.readFile(routerPath, "utf-8");
  const importLine = `const ${pageName}Page = lazy(() => import("@/pages/${name.toLowerCase()}/${pageName}Page"));`;

  if (!routerCode.includes(importLine)) {
    const pageImportRegex = /^const \w+Page = lazy\(.*?\);/gm;
    let lastMatch, match;
    while ((match = pageImportRegex.exec(routerCode)) !== null) lastMatch = match;
    if (lastMatch) {
      routerCode = routerCode.replace(lastMatch[0], `${lastMatch[0]}\n${importLine}`);
    } else {
      routerCode = routerCode.replace("export function AppRouter()", `${importLine}\nexport function AppRouter()`);
    }
    await fs.writeFile(routerPath, routerCode);
    spinner.succeed("Added lazy import to AppRouter.jsx");
    routerCode = await fs.readFile(routerPath, "utf-8");
  }

  const routePath = customRoute || `/${name}`;
  const routeBlock = `${pageName}Page`;
  const indentedInsert = `\n      {/* ${pageName} */}
        <Route
          path="${routePath}"
          element={<AppShell secure><${routeBlock} /></AppShell>}
        />`;

  if (routerCode.includes(`path="\${routePath}"`)) {
    console.log(chalk.gray("ℹ  Route already exists"));
  } else {
    const wildcardRegex = /^(\s*)<Route\s+path="\*"\s+element=.*?\/>/m;
    const wildcardMatch = routerCode.match(wildcardRegex);
    if (wildcardMatch) {
      routerCode = routerCode.replace(wildcardRegex, indentedInsert + "\n" + wildcardMatch[0]);
    } else {
      routerCode = routerCode.replace("</Routes>", `${indentedInsert}\n      </Routes>`);
    }
    await fs.writeFile(routerPath, routerCode);
    spinner.succeed("Added route to AppRouter.jsx");
  }
}

async function updateNavigation(presetPath, pageName, routePath, icon, spinner) {
  if (!fs.existsSync(presetPath)) {
    console.log(chalk.yellow("⚠  app-preset.js not found — add nav manually."));
    return;
  }
  let presetCode = await fs.readFile(presetPath, "utf-8");
  const navEntry = `{ label: "${pageName}", href: "${routePath}", icon: "${icon || "layout"}" },`;

  if (presetCode.includes(`href: "\${routePath}"`)) {
    console.log(chalk.gray("ℹ  Navigation entry already present"));
  } else {
    const navMatch = presetCode.match(/navigation:\s*\[([\s\S]*?)\]/);
    if (!navMatch) {
      console.log(chalk.yellow("⚠  Could not find navigation array — skipping"));
    } else {
      let existingItems = navMatch[1].trim();
      const cleaned = existingItems.replace(/,?\s*\\$\{newItems\}/, "").replace(/,\s*\$/, "");
      const newItems = cleaned ? `${cleaned},\n      ${navEntry}` : navEntry;
      const replacement = `navigation: [\n      ${newItems}\n    ]`;
      presetCode = presetCode.replace(/navigation:\s*\[([\s\S]*?)\]/, replacement);
      await fs.writeFile(presetPath, presetCode, "utf-8");
      spinner.succeed("Added navigation entry to app-preset.js");
    }
  }
}