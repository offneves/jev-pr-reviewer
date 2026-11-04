import { describe, expect, it } from "vitest";
import { buildInventory } from "../../src/state/inventory.js";
import { ChangeInventorySchema } from "../../src/schema.js";

const ADDED = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function createUser(name: string) {
+    return { name };
+}
`;

const MODIFIED = `diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
`;

const DELETED = `diff --git a/scripts/old.py b/scripts/old.py
deleted file mode 100644
index 3333333..0000000
--- a/scripts/old.py
+++ /dev/null
@@ -1,2 +0,0 @@
-def legacy():
-    pass
`;

const RENAMED = `diff --git a/src/a/Util.java b/src/b/Helper.java
similarity index 90%
rename from src/a/Util.java
rename to src/b/Helper.java
index 4444444..5555555 100644
--- a/src/a/Util.java
+++ b/src/b/Helper.java
@@ -1,3 +1,3 @@
-public class Util {
+public class Helper {
 }
`;

describe("inventory files (ENRICH-01/02)", () => {
    const inv = buildInventory(`${ADDED}${MODIFIED}${DELETED}${RENAMED}`);

    it("classifies added, modified, deleted and renamed files", () => {
        expect(inv.files.map((f) => [f.path, f.status])).toEqual([
            ["src/new.ts", "added"],
            ["README.md", "modified"],
            ["scripts/old.py", "deleted"],
            ["src/b/Helper.java", "renamed"],
        ]);
    });

    it("sets language from the extension", () => {
        expect(inv.files.map((f) => f.language)).toEqual([
            "typescript",
            "other",
            "python",
            "java",
        ]);
        expect(buildInventory(ADDED.replaceAll("new.ts", "new.mjs")).files[0].language).toBe(
            "javascript",
        );
    });

    it("produces a schema-valid inventory", () => {
        expect(() => ChangeInventorySchema.parse(inv)).not.toThrow();
    });
});

describe("inventory edge cases", () => {
    it("returns empty files for an empty diff", () => {
        const inv = buildInventory("");
        expect(inv.files).toEqual([]);
        expect(inv.symbols).toEqual({ added: [], modified: [], removed: [] });
        expect(inv.blastRadius.directories).toEqual([]);
        expect(inv.testsOrDocsOnly).toBe(false);
    });

    it("uses the new path for renames", () => {
        const inv = buildInventory(RENAMED);
        expect(inv.files).toEqual([
            { path: "src/b/Helper.java", status: "renamed", language: "java" },
        ]);
    });
});

describe("symbols: added (ENRICH-05)", () => {
    it("detects a TypeScript function", () => {
        expect(buildInventory(ADDED).symbols.added).toEqual([
            { name: "createUser", kind: "function", path: "src/new.ts" },
        ]);
    });

    it("detects a Java class and method", () => {
        const diff = `diff --git a/src/Svc.java b/src/Svc.java
--- a/src/Svc.java
+++ b/src/Svc.java
@@ -1,2 +1,6 @@
 package acme;
+public class Svc {
+    public List<String> findAll(int limit) {
+        return repo.findAll(limit);
+    }
+}
`;
        expect(buildInventory(diff).symbols.added).toEqual([
            { name: "Svc", kind: "class", path: "src/Svc.java" },
            { name: "findAll", kind: "method", path: "src/Svc.java" },
        ]);
    });

    it("detects JS arrow functions and class methods", () => {
        const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,1 +1,6 @@
 // header
+export const handler = async (req) => {
+};
+class Store {
+  save(item) {
+  }
`;
        const names = buildInventory(diff).symbols.added.map((s) => [s.name, s.kind]);
        expect(names).toEqual([
            ["handler", "function"],
            ["Store", "class"],
            ["save", "method"],
        ]);
    });

    it("detects Python functions, classes and methods", () => {
        const diff = `diff --git a/app/svc.py b/app/svc.py
--- a/app/svc.py
+++ b/app/svc.py
@@ -1,1 +1,5 @@
 import os
+def run():
+    pass
+class Job:
+    async def execute(self):
`;
        const names = buildInventory(diff).symbols.added.map((s) => [s.name, s.kind]);
        expect(names).toEqual([
            ["run", "function"],
            ["Job", "class"],
            ["execute", "method"],
        ]);
    });

    it("ignores calls and control flow lines", () => {
        const diff = `diff --git a/src/X.java b/src/X.java
--- a/src/X.java
+++ b/src/X.java
@@ -1,1 +1,4 @@
 x
+        if (ok) {
+        String s = format(x);
+        return compute(x);
`;
        expect(buildInventory(diff).symbols.added).toEqual([]);
    });
});

describe("symbols: modified (ENRICH-06)", () => {
    it("marks a body change under a context declaration as modified", () => {
        const diff = `diff --git a/app/svc.py b/app/svc.py
--- a/app/svc.py
+++ b/app/svc.py
@@ -1,3 +1,3 @@
 def charge(amount):
-    return amount
+    return amount * 2
`;
        const inv = buildInventory(diff);
        expect(inv.symbols.modified).toEqual([
            { name: "charge", kind: "function", path: "app/svc.py" },
        ]);
        expect(inv.symbols.added).toEqual([]);
        expect(inv.symbols.removed).toEqual([]);
    });

    it("uses the hunk header context when the declaration is outside the hunk", () => {
        const diff = `diff --git a/src/Svc.java b/src/Svc.java
--- a/src/Svc.java
+++ b/src/Svc.java
@@ -10,3 +10,3 @@ public void process(Order order) {
         validate(order);
-        save(order);
+        saveAll(order);
`;
        expect(buildInventory(diff).symbols.modified).toEqual([
            { name: "process", kind: "method", path: "src/Svc.java" },
        ]);
    });

    it("marks a changed declaration line (signature change) as modified", () => {
        const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-export function load(id: string) {
+export function load(id: string, force = false) {
 }
`;
        const inv = buildInventory(diff);
        expect(inv.symbols.modified).toEqual([
            { name: "load", kind: "function", path: "src/a.ts" },
        ]);
        expect(inv.symbols.added).toEqual([]);
        expect(inv.symbols.removed).toEqual([]);
    });
});

describe("symbols: removed (ENRICH-07)", () => {
    it("lists removed declarations", () => {
        expect(buildInventory(DELETED).symbols.removed).toEqual([
            { name: "legacy", kind: "function", path: "scripts/old.py" },
        ]);
    });
});

describe("symbols: other languages (ENRICH-08)", () => {
    it("returns empty symbol arrays for unknown languages", () => {
        const diff = `diff --git a/main.go b/main.go
--- a/main.go
+++ b/main.go
@@ -1 +1,2 @@
 package main
+func Run() {}
`;
        const inv = buildInventory(diff);
        expect(inv.files[0].language).toBe("other");
        expect(inv.symbols).toEqual({ added: [], modified: [], removed: [] });
    });
});

describe("aggregates (ENRICH-09/10)", () => {
    it("lists sorted unique parent directories", () => {
        const inv = buildInventory(`${RENAMED}${ADDED}${MODIFIED}`);
        expect(inv.blastRadius.directories).toEqual([".", "src", "src/b"]);
    });

    it("lists sensitive paths with their category", () => {
        const paths = [
            "src/auth/LoginController.java",
            "db/migrations/001_init.sql",
            ".env.production",
            ".github/workflows/ci.yml",
            "Dockerfile",
            "package-lock.json",
            "src/ui/Button.tsx",
        ];
        const diff = paths
            .map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-a\n+b\n`)
            .join("");
        expect(buildInventory(diff).sensitive).toEqual([
            { path: "src/auth/LoginController.java", category: "auth" },
            { path: "db/migrations/001_init.sql", category: "migration" },
            { path: ".env.production", category: "secrets" },
            { path: ".github/workflows/ci.yml", category: "ci-config" },
            { path: "Dockerfile", category: "docker-file" },
            { path: "package-lock.json", category: "lockfile" },
        ]);
    });

    it("sets testsOrDocsOnly only when every path is a test or doc", () => {
        const testDiff = ADDED.replaceAll("src/new.ts", "tests/new.test.ts");
        expect(buildInventory(`${testDiff}${MODIFIED}`).testsOrDocsOnly).toBe(true);
        expect(buildInventory(`${ADDED}${MODIFIED}`).testsOrDocsOnly).toBe(false);
    });
});
