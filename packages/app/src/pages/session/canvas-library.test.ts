import { describe, expect, test } from "bun:test"
import { buildQuery, folderLabel, folderTitle, parseFolders, parseProjects } from "./canvas-library"

describe("parseFolders", () => {
  test("reads the v1 media/folders payload", () => {
    const folders = parseFolders({
      success: true,
      folders: [
        {
          id: "f1",
          name: "Cast",
          description: "locked faces",
          color: "#3B82F6",
          icon: "users",
          item_count: 12,
          is_owner: true,
          shared_with_count: 2,
          shared_with: ["u2", "u3"],
          project_id: "p1",
        },
        {
          _id: "f2",
          name: "Shared kit",
          itemCount: 4,
          isOwner: false,
          sharedWith: ["me"],
        },
      ],
      count: 2,
    })
    expect(folders).toEqual([
      {
        id: "f1",
        name: "Cast",
        description: "locked faces",
        color: "#3B82F6",
        icon: "users",
        item_count: 12,
        is_owner: true,
        shared_with_count: 2,
        project_id: "p1",
      },
      {
        id: "f2",
        name: "Shared kit",
        description: null,
        color: null,
        icon: null,
        item_count: 4,
        is_owner: false,
        shared_with_count: 1,
        project_id: null,
      },
    ])
  })

  test("labels omit stale API counts unless a live total is passed", () => {
    const owned = parseFolders({ folders: [{ id: "f1", name: "Cast", item_count: 3 }] })[0]!
    const shared = parseFolders({ folders: [{ id: "f2", name: "Kit", is_owner: false, item_count: 1 }] })[0]!
    expect(folderLabel(owned)).toBe("Cast")
    expect(folderLabel(owned, 5)).toBe("Cast (5)")
    expect(folderLabel(shared)).toBe("Kit · shared")
    expect(folderTitle(owned)).not.toContain("items")
    expect(folderTitle(owned, 5)).toContain("5 items")
    expect(folderTitle(shared)).toContain("shared with you")
  })
})

describe("parseProjects", () => {
  test("reads lightweight and v1 project shapes", () => {
    const fromLight = parseProjects({
      data: [{ _id: "p1", name: "Cast", cover: { manual: { url: "https://cdn.example/a.jpg" } } }],
    })
    const fromV1 = parseProjects([{ id: "p2", name: "Kit", thumbnail: "https://cdn.example/b.jpg" }])
    expect(fromLight).toEqual([{ id: "p1", name: "Cast", thumbnail: "https://cdn.example/a.jpg" }])
    expect(fromV1).toEqual([{ id: "p2", name: "Kit", thumbnail: "https://cdn.example/b.jpg" }])
  })
})

describe("buildQuery", () => {
  test("sends folder_id with the other media filters", () => {
    const qs = buildQuery({
      projectId: "p1",
      type: "image",
      category: "ai",
      folderId: "f1",
      page: 2,
      pageSize: 24,
    })
    const p = new URLSearchParams(qs)
    expect(p.get("project_id")).toBe("p1")
    expect(p.get("folder_id")).toBe("f1")
    expect(p.get("type")).toBe("image")
    expect(p.get("category")).toBe("ai")
    expect(p.get("page")).toBe("2")
    expect(p.get("page_size")).toBe("24")
  })

  test("omits all-project / all-type / trash category", () => {
    const qs = buildQuery({
      projectId: "all",
      type: "all",
      category: "trash",
      folderId: null,
      page: 1,
      pageSize: 16,
    })
    const p = new URLSearchParams(qs)
    expect(p.has("project_id")).toBe(false)
    expect(p.has("folder_id")).toBe(false)
    expect(p.has("type")).toBe(false)
    expect(p.has("category")).toBe(false)
  })
})
