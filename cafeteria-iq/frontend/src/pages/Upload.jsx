import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { upload } from "../services/api";
import GlassCard from "../components/ui/GlassCard";
import toast from "react-hot-toast";

export default function Upload() {
  const onDrop = useCallback((files) => {
    const f = files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    upload
      .uploadCSV(fd)
      .then((r) => toast.success("Imported: " + (r.data?.count || "ok")))
      .catch((e) => toast.error(e.message));
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "text/csv": [".csv"] } });
  return (
    <div>
      <h1 className="display-font text-3xl mb-4">Upload CSV</h1>
      <GlassCard
        {...getRootProps()}
        className="border-2 border-dashed border-amber-500/30 py-20 text-center cursor-pointer"
      >
        <input {...getInputProps()} />
        {isDragActive ? "Drop here" : "Drag CSV, or click"}
      </GlassCard>
    </div>
  );
}
