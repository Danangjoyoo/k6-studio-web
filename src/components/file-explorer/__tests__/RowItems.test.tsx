/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FileItem from "@/components/file-explorer/FileItem";
import FolderItem from "@/components/file-explorer/FolderItem";

function renderFileItem(
  props: Partial<React.ComponentProps<typeof FileItem>> = {}
) {
  const defaults: React.ComponentProps<typeof FileItem> = {
    name: "login.ts",
    path: "src/login.ts",
    isSelected: false,
    onClick: jest.fn(),
    onDelete: jest.fn(),
    onRename: jest.fn(),
  };
  return render(<FileItem {...defaults} {...props} />);
}

function renderFolderItem(
  props: Partial<React.ComponentProps<typeof FolderItem>> = {}
) {
  const defaults: React.ComponentProps<typeof FolderItem> = {
    name: "src",
    path: "src/",
    onRename: jest.fn(),
    onDelete: jest.fn(),
    onCreateScript: jest.fn(),
    onCreateFolder: jest.fn(),
    children: <div>child content</div>,
  };
  return render(<FolderItem {...defaults} {...props} />);
}

describe("file explorer row items", () => {
  it("file row keeps the checkbox mounted but visually hidden until selection controls are active", () => {
    const onSelectionChange = jest.fn();
    renderFileItem({
      isSelectionChecked: false,
      onSelectionChange,
    });

    const row = screen.getByTestId("sidebar-file-item");
    const control = within(row).getByTestId("row-selection-control");
    const checkbox = within(row).getByRole("checkbox", {
      name: "Select login.ts",
    });

    expect(checkbox).not.toBeChecked();
    expect(control).toHaveAttribute("data-selection-visible", "false");
    expect(control).toHaveClass("opacity-0");
  });

  it("selected file row shows the checkbox and exposes aria-selected", () => {
    renderFileItem({
      isSelectionChecked: true,
      onSelectionChange: jest.fn(),
    });

    const row = screen.getByTestId("sidebar-file-item");
    const control = within(row).getByTestId("row-selection-control");

    expect(row).toHaveAttribute("aria-selected", "true");
    expect(control).toHaveAttribute("data-selection-visible", "true");
    expect(control).toHaveClass("opacity-100");
  });

  it("file row checkbox toggles callback and does not select the file", () => {
    const onClick = jest.fn();
    const onSelectionChange = jest.fn();
    renderFileItem({
      onClick,
      isSelectionChecked: false,
      showSelectionControl: true,
      onSelectionChange,
    });

    const row = screen.getByTestId("sidebar-file-item");
    const checkbox = within(row).getByRole("checkbox", {
      name: "Select login.ts",
    });

    fireEvent.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(true, "src/login.ts");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("folder row checkbox toggles callback and does not expand or collapse", () => {
    const onSelectionChange = jest.fn();
    const onToggleOpen = jest.fn();
    renderFolderItem({
      isOpen: true,
      onToggleOpen,
      isSelectionChecked: false,
      showSelectionControl: true,
      onSelectionChange,
    });

    const row = screen.getByTestId("sidebar-folder-item");
    const checkbox = within(row).getByRole("checkbox", {
      name: "Select src",
    });

    fireEvent.click(checkbox);

    expect(onSelectionChange).toHaveBeenCalledWith(true, "src/");
    expect(onToggleOpen).not.toHaveBeenCalled();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("space toggles row selection while enter keeps the primary action", () => {
    const onClick = jest.fn();
    const onSelectionToggle = jest.fn();
    renderFileItem({
      onClick,
      onSelectionToggle,
      onSelectionChange: jest.fn(),
    });

    const fileRow = screen.getByTestId("sidebar-file-item");
    fireEvent.keyDown(fileRow, { key: " ", code: "Space" });
    fireEvent.keyDown(fileRow, { key: "Enter", code: "Enter" });

    expect(onSelectionToggle).toHaveBeenCalledWith("src/login.ts");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("controlled folder rows call onToggleOpen for primary actions", () => {
    const onToggleOpen = jest.fn();
    renderFolderItem({
      isOpen: true,
      onToggleOpen,
    });

    const folderRow = screen.getByTestId("sidebar-folder-item");
    fireEvent.click(folderRow);
    fireEvent.keyDown(folderRow, { key: "Enter", code: "Enter" });

    expect(onToggleOpen).toHaveBeenCalledTimes(2);
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("uncontrolled folder rows with onToggleOpen still update internal visibility", () => {
    const onToggleOpen = jest.fn();
    renderFolderItem({
      defaultOpen: true,
      onToggleOpen,
    });

    const folderRow = screen.getByTestId("sidebar-folder-item");
    fireEvent.click(folderRow);

    expect(onToggleOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });

  it("file row can be dragged and calls drag start and end callbacks with the path", () => {
    const onRowDragStart = jest.fn();
    const onRowDragEnd = jest.fn();
    renderFileItem({
      isDragEnabled: true,
      onRowDragStart,
      onRowDragEnd,
    });

    const row = screen.getByTestId("sidebar-file-item");
    fireEvent.dragStart(row);
    fireEvent.dragEnd(row);

    expect(row).toHaveAttribute("draggable", "true");
    expect(onRowDragStart).toHaveBeenCalledWith("src/login.ts", expect.any(Object));
    expect(onRowDragEnd).toHaveBeenCalledWith("src/login.ts", expect.any(Object));
  });

  it("folder row accepts drag over and drop callbacks and marks active drop state", () => {
    const onRowDragOver = jest.fn();
    const onRowDrop = jest.fn();
    renderFolderItem({
      isDropActive: true,
      onRowDragOver,
      onRowDrop,
    });

    const row = screen.getByTestId("sidebar-folder-item");
    fireEvent.dragOver(row);
    fireEvent.drop(row);

    expect(row).toHaveAttribute("data-drop-active", "true");
    expect(onRowDragOver).toHaveBeenCalledWith("src/", expect.any(Object));
    expect(onRowDrop).toHaveBeenCalledWith("src/", expect.any(Object));
  });

  it("rows without drop callbacks do not cancel drag over or drop events", () => {
    renderFileItem();
    renderFolderItem();

    const fileRow = screen.getByTestId("sidebar-file-item");
    const folderRow = screen.getByTestId("sidebar-folder-item");
    const fileDragOver = new Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    const fileDrop = new Event("drop", { bubbles: true, cancelable: true });
    const folderDragOver = new Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    const folderDrop = new Event("drop", { bubbles: true, cancelable: true });

    expect(fireEvent(fileRow, fileDragOver)).toBe(true);
    expect(fileDragOver.defaultPrevented).toBe(false);
    expect(fireEvent(fileRow, fileDrop)).toBe(true);
    expect(fileDrop.defaultPrevented).toBe(false);
    expect(fireEvent(folderRow, folderDragOver)).toBe(true);
    expect(folderDragOver.defaultPrevented).toBe(false);
    expect(fireEvent(folderRow, folderDrop)).toBe(true);
    expect(folderDrop.defaultPrevented).toBe(false);
  });

  it("disabled selection and drag do not block normal file selection or folder expand", () => {
    const onClick = jest.fn();
    const onSelectionChange = jest.fn();
    const onRowDragStart = jest.fn();
    renderFileItem({
      onClick,
      isSelectionChecked: false,
      isSelectionDisabled: true,
      onSelectionChange,
      isDragEnabled: true,
      isDragDisabled: true,
      onRowDragStart,
    });

    const fileRow = screen.getByTestId("sidebar-file-item");
    fireEvent.click(within(fileRow).getByRole("checkbox", { name: "Select login.ts" }));
    fireEvent.dragStart(fileRow);
    fireEvent.click(fileRow);

    expect(fileRow).not.toHaveAttribute("aria-disabled");
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onRowDragStart).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);

    renderFolderItem({
      defaultOpen: true,
      isSelectionChecked: false,
      isSelectionDisabled: true,
      onSelectionChange,
    });

    const folderRow = screen.getByTestId("sidebar-folder-item");
    fireEvent.click(within(folderRow).getByRole("checkbox", { name: "Select src" }));
    fireEvent.click(folderRow);

    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });

  it("disabled checkboxes are native disabled and keyboard-safe", () => {
    const onClick = jest.fn();
    const onSelectionChange = jest.fn();
    renderFileItem({
      onClick,
      isSelectionChecked: false,
      isSelectionDisabled: true,
      onSelectionChange,
    });

    const fileRow = screen.getByTestId("sidebar-file-item");
    const fileCheckbox = within(fileRow).getByRole("checkbox", {
      name: "Select login.ts",
    });
    fireEvent.click(fileCheckbox);
    fireEvent.keyDown(fileCheckbox, { key: " ", code: "Space" });
    fireEvent.keyDown(fileCheckbox, { key: "Enter", code: "Enter" });

    expect(fileCheckbox).toBeDisabled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();

    renderFolderItem({
      defaultOpen: true,
      isSelectionChecked: false,
      isSelectionDisabled: true,
      onSelectionChange,
    });

    const folderRow = screen.getByTestId("sidebar-folder-item");
    const folderCheckbox = within(folderRow).getByRole("checkbox", {
      name: "Select src",
    });
    fireEvent.keyDown(folderCheckbox, { key: " ", code: "Space" });
    fireEvent.keyDown(folderCheckbox, { key: "Enter", code: "Enter" });

    expect(folderCheckbox).toBeDisabled();
    expect(onSelectionChange).not.toHaveBeenCalled();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("enabled checkbox keyboard events do not trigger row primary actions", () => {
    const onClick = jest.fn();
    const onSelectionChange = jest.fn();
    renderFileItem({
      onClick,
      isSelectionChecked: false,
      onSelectionChange,
    });

    const fileRow = screen.getByTestId("sidebar-file-item");
    const fileCheckbox = within(fileRow).getByRole("checkbox", {
      name: "Select login.ts",
    });
    fireEvent.keyDown(fileCheckbox, { key: " ", code: "Space" });
    fireEvent.keyDown(fileCheckbox, { key: "Enter", code: "Enter" });

    expect(onClick).not.toHaveBeenCalled();
  });

  it("existing action buttons keep stopping row interactions", () => {
    const onFileClick = jest.fn();
    const onFileDelete = jest.fn();
    renderFileItem({ onClick: onFileClick, onDelete: onFileDelete });

    const fileRow = screen.getByTestId("sidebar-file-item");
    fireEvent.click(within(fileRow).getByRole("button", { name: "Delete script" }));

    expect(onFileDelete).toHaveBeenCalledTimes(1);
    expect(onFileClick).not.toHaveBeenCalled();
  });

  it("folder action buttons call callbacks without toggling expansion", () => {
    const onCreateScript = jest.fn();
    const onCreateFolder = jest.fn();
    const onDelete = jest.fn();
    renderFolderItem({
      defaultOpen: true,
      onCreateScript,
      onCreateFolder,
      onDelete,
    });

    const folderRow = screen.getByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "New script here" })
    );
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "New folder here" })
    );
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "Delete folder" })
    );

    expect(onCreateScript).toHaveBeenCalledWith("src/");
    expect(onCreateFolder).toHaveBeenCalledWith("src/");
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
