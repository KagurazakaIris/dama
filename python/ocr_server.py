#!/usr/bin/env python3
"""PaddleOCR server - communicates via stdin/stdout JSON protocol."""

import sys
import json
import traceback


def init_ocr():
    """Initialize PaddleOCR engine."""
    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
        return ocr
    except ImportError:
        print(
            json.dumps({"status": "error", "error": "PaddleOCR not installed"}),
            file=sys.stderr,
        )
        return None


def process_ocr(ocr, image_path):
    """Run OCR on an image and return results."""
    result = ocr.ocr(image_path, cls=True)

    ocr_results = []
    if result and result[0]:
        for line in result[0]:
            polygon = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            text = line[1][0]
            confidence = float(line[1][1])

            # Calculate bounding box from polygon
            xs = [p[0] for p in polygon]
            ys = [p[1] for p in polygon]
            x = min(xs)
            y = min(ys)
            w = max(xs) - x
            h = max(ys) - y

            ocr_results.append({
                "text": text,
                "confidence": confidence,
                "bbox": [int(x), int(y), int(w), int(h)],
                "polygon": [[int(p[0]), int(p[1])] for p in polygon],
            })

    return ocr_results


def main():
    ocr = init_ocr()

    # Signal ready
    print(json.dumps({"status": "ok"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            print(
                json.dumps({"status": "error", "error": "Invalid JSON"}),
                flush=True,
            )
            continue

        cmd = msg.get("cmd")
        msg_id = msg.get("id")

        if cmd == "ping":
            resp = {"status": "ok"}
            if msg_id is not None:
                resp["id"] = msg_id
            print(json.dumps(resp), flush=True)

        elif cmd == "ocr":
            image_path = msg.get("image_path")
            try:
                if ocr is None:
                    results = []
                else:
                    results = process_ocr(ocr, image_path)
                resp = {"status": "ok", "results": results}
            except Exception as e:
                resp = {"status": "error", "error": str(e)}
                traceback.print_exc(file=sys.stderr)

            if msg_id is not None:
                resp["id"] = msg_id
            print(json.dumps(resp), flush=True)

        elif cmd == "shutdown":
            break

        else:
            resp = {"status": "error", "error": f"Unknown command: {cmd}"}
            if msg_id is not None:
                resp["id"] = msg_id
            print(json.dumps(resp), flush=True)


if __name__ == "__main__":
    main()
