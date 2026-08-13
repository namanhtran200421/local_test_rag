import json
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent


class ProductionIndexTest(unittest.TestCase):
    def test_all_agent_indexes_are_isolated_and_valid(self):
        for agent in ("public", "manager"):
            pointer = json.loads((ROOT / "data" / agent / "current.json").read_text())
            self.assertEqual(pointer["agent"], agent)
            version = ROOT / "data" / agent / pointer["path"]
            manifest = json.loads((version / "manifest.json").read_text())
            self.assertEqual(manifest["agent"], agent)
            self.assertEqual(manifest["access"], agent)
            recall = manifest["evaluation"].get("recallAt3", manifest["evaluation"].get("recallAt5"))
            self.assertEqual(recall, 1)
            chunks = [json.loads(line) for line in (version / "chunks.jsonl").read_text().splitlines()]
            self.assertTrue(chunks)
            self.assertTrue(all(chunk["access"] == agent for chunk in chunks))
            if agent == "public":
                self.assertTrue(manifest["realData"])
                self.assertFalse(manifest["synthetic"])
                self.assertEqual(manifest["sourceRoot"], "csv")
                catalog = json.loads((version / manifest["artifacts"]["catalog"]).read_text())
                self.assertEqual(len(catalog["programs"]), manifest["programCount"])
                self.assertEqual(manifest["programCount"], 136)
                self.assertTrue(all(chunk["synthetic"] is False for chunk in chunks))
            rows, columns = manifest["embeddingDimensions"]
            vectors = np.fromfile(version / "embeddings.f32", dtype="<f4").reshape(rows, columns)
            self.assertTrue(np.isfinite(vectors).all())
            self.assertTrue(np.allclose(np.linalg.norm(vectors, axis=1), 1, atol=1e-3))


if __name__ == "__main__":
    unittest.main()
