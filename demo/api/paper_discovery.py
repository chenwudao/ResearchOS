"""One literature search contract for Web tools and SDK MCP callers."""

from concurrent.futures import ThreadPoolExecutor
from itertools import zip_longest
from io import BytesIO
import json
import os
import re
from threading import Lock
from time import monotonic, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import build_opener, HTTPRedirectHandler, Request
from xml.etree import ElementTree
import workspace


def _doi(value):
    doi = workspace.text(value, 300).lower().removeprefix("https://doi.org/")
    return doi if doi.startswith("10.") else ""


def _crossref(query, limit):
    params = urlencode({"query.bibliographic": query, "rows": limit,
                        "select": "DOI,URL,title,published,author,container-title,type"})
    result = json.loads(workspace.fetch_source("https://api.crossref.org/works?" + params))
    for record in result["message"]["items"]:
        if paper := _crossref_paper(record):
            yield paper


def _crossref_paper(record):
    title = next(iter(record.get("title") or []), "")
    if not title:
        return None
    parts = (record.get("published", {}).get("date-parts") or [[]])[0]
    authors = [" ".join(filter(None, (person.get("given"), person.get("family"))))
               for person in (record.get("author") or [])[:15]]
    return {"text": title, "url": workspace.safe_link(record.get("URL")),
            "published": "-".join(f"{part:02d}" for part in parts), "doi": _doi(record.get("DOI")),
            "authors": list(filter(None, authors)), "venue": next(iter(record.get("container-title") or []), ""),
            "type": record.get("type") or ""}


OPENALEX_FIELDS = "id,doi,title,publication_date,primary_location,open_access,type,authorships,cited_by_count"


def _openalex_request(path="", **params):
    key = os.environ.get("OPENALEX_API_KEY", "").strip()
    headers = {"Authorization": f"Bearer {key}"} if key else None
    url = "https://api.openalex.org/works" + path + "?" + urlencode(params)
    return json.loads(workspace.fetch_source(url, headers=headers))


def _openalex_paper(record):
    if not record.get("title"):
        return None
    identity = workspace.safe_link(record.get("id"))
    location = record.get("primary_location") or {}
    authors = [(entry.get("author") or {}).get("display_name") for entry in (record.get("authorships") or [])[:15]]
    return {"text": record["title"], "url": workspace.safe_link(location.get("landing_page_url")) or identity,
            "openAlexId": identity, "published": record.get("publication_date") or "", "doi": _doi(record.get("doi")),
            "authors": list(filter(None, authors)), "venue": (location.get("source") or {}).get("display_name") or "",
            "type": record.get("type") or "", "citedByCount": record.get("cited_by_count"),
            "openAccessUrl": workspace.safe_link((record.get("open_access") or {}).get("oa_url"))}


def _openalex(query, limit):
    for record in _openalex_request(search=query, per_page=limit, select=OPENALEX_FIELDS)["results"]:
        if paper := _openalex_paper(record):
            yield paper


def _europepmc(query, limit):
    params = urlencode({"query": query, "pageSize": limit, "format": "json"})
    source = json.loads(workspace.fetch_source("https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + params))
    for record in source["resultList"]["result"]:
        if record.get("title") and record.get("source") and record.get("id"):
            identity = quote(record["source"], safe="") + "/" + quote(record["id"], safe="")
            page = "https://europepmc.org/article/" + identity
            pmcid = record.get("pmcid")
            yield {"text": record["title"], "url": page, "doi": _doi(record.get("doi")),
                   "published": record.get("firstPublicationDate") or record.get("pubYear") or "",
                   "authors": [part.strip() for part in (record.get("authorString") or "").split(",")[:15] if part.strip()],
                   "venue": record.get("journalTitle") or "", "pmid": record.get("pmid") or "",
                   "pmcid": pmcid or "", "citedByCount": record.get("citedByCount"),
                   "openAccessUrl": page if record.get("isOpenAccess") == "Y" else ""}


ARXIV_ID = re.compile(r"(?:(?:https?://arxiv\.org/(?:abs|pdf)/)|arxiv:)?(\d{4}\.\d{4,5}(?:v\d+)?)", re.I)
ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
ARXIV_LOCK = Lock()
_arxiv_started = 0.0


def _arxiv_feed(**query):
    global _arxiv_started
    with ARXIV_LOCK:
        if delay := max(0.0, 3.0 - (monotonic() - _arxiv_started)):
            sleep(delay)
        _arxiv_started = monotonic()
        feed = ElementTree.fromstring(workspace.fetch_source("https://export.arxiv.org/api/query?" + urlencode(query)))
    for entry in feed.findall("atom:entry", ARXIV_NS):
        source_id = entry.findtext("atom:id", "", ARXIV_NS)
        if not (match := ARXIV_ID.fullmatch(source_id)):
            if "/api/errors" in source_id:
                raise ValueError("arXiv search failed")
            continue
        identity = match.group(1).lower()
        landing = "https://arxiv.org/abs/" + identity
        title = " ".join(entry.findtext("atom:title", "", ARXIV_NS).split())
        if title:
            yield {"text": title, "url": landing, "arxivId": identity, "doi": "",
                   "publishedDoi": _doi(entry.findtext("arxiv:doi", "", ARXIV_NS)),
                   "published": entry.findtext("atom:published", "", ARXIV_NS)[:10], "type": "preprint",
                   "authors": [node.text for node in entry.findall("atom:author/atom:name", ARXIV_NS)[:15] if node.text],
                   "openAccessUrl": landing}


def _arxiv(query, limit):
    terms = re.findall(r"[^\W_]+", query, re.UNICODE)[:12]
    if terms:
        return _arxiv_feed(search_query='all:"' + " ".join(terms) + '"', max_results=limit)
    return []


SOURCES = {"crossref": ("Crossref", _crossref), "openalex": ("OpenAlex", _openalex),
           "arxiv": ("arXiv", _arxiv), "europepmc": ("Europe PMC", _europepmc)}
DEFAULT_SOURCES = ["crossref", "openalex"]


def _attempt(provider, read):
    label = SOURCES[provider][0]
    try:
        records = list(read())
    except HTTPError as error:
        status = {401: "authentication_required", 403: "access_denied", 404: "not_found", 429: "rate_limited"}.get(error.code, "unavailable")
        return {"provider": provider, "status": status}, []
    except (TimeoutError, URLError, OSError):
        return {"provider": provider, "status": "unavailable"}, []
    except (KeyError, ValueError, TypeError, ElementTree.ParseError):
        return {"provider": provider, "status": "invalid_response"}, []
    return {"provider": provider, "status": "ok", "returned": len(records)}, [
        {**record, "source": label, "sources": [label], "kind": "paper", "evidenceLevel": "metadata"}
        for record in records
    ]


def _merge(batches):
    merged = {}
    for group in zip_longest(*batches):
        for paper in filter(None, group):
            preprint_id = paper.get("arxivId")
            doi = paper["doi"]
            identity = ("10.48550/arxiv." + preprint_id.split("v", 1)[0] if preprint_id else doi)
            identity = identity or paper.get("openAlexId") or paper["url"] or paper["text"].casefold()
            if identity not in merged:
                merged[identity] = paper
                continue
            known = merged[identity]
            known["sources"] = list(dict.fromkeys([*known["sources"], *paper["sources"]]))
            for key, value in paper.items():
                if key not in ("source", "sources") and (key not in known or known[key] in (None, "", [])):
                    known[key] = value
    return list(merged.values())


def _limit(args):
    limit = args.get("limit", 8)
    if type(limit) is not int or not 1 <= limit <= 25:
        raise workspace.WorkspaceError(400, "论文条数须在 1–25 之间。")
    return limit


def search(args):
    query = workspace.text(args.get("query"), 300)
    limit = _limit(args)
    providers = args.get("providers", DEFAULT_SOURCES)
    if not query:
        raise workspace.WorkspaceError(400, "请输入论文检索词。")
    if not isinstance(providers, list) or not providers or any(
        not isinstance(provider, str) or provider not in SOURCES for provider in providers
    ):
        raise workspace.WorkspaceError(400, "论文来源可选 Crossref、OpenAlex、arXiv 或 Europe PMC。")
    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        pending = [pool.submit(_attempt, provider, lambda search=SOURCES[provider][1]: search(query, limit))
                   for provider in dict.fromkeys(providers)]
        responses = [future.result() for future in pending]
    status, batches = zip(*responses)
    if all(item["status"] != "ok" for item in status):
        labels = "、".join(SOURCES[item["provider"]][0] for item in status)
        raise workspace.WorkspaceError(502, f"论文来源暂不可用（{labels}），请稍后重试或检查来源配置。")

    title = " ".join(query.casefold().split())
    papers = sorted(_merge(batches), key=lambda paper: " ".join(paper["text"].casefold().split()) != title)[:limit]
    return {"query": query, "papers": papers, "providers": list(status)} if args.get("includeStatus") else papers


def _identifier(value):
    raw = workspace.text(value, 300)
    if re.fullmatch(r"10\.\d{4,9}/\S{1,240}", doi := _doi(raw)):
        return "doi", doi
    if match := re.fullmatch(r"(?:https://openalex\.org/)?(W[0-9]+)", raw, re.I):
        return "openalex", match.group(1).upper()
    if match := ARXIV_ID.fullmatch(raw):
        return "arxiv", match.group(1).lower()
    raise workspace.WorkspaceError(400, "请输入 DOI、OpenAlex ID 或 arXiv ID。")


def _openalex_seed(kind, identity, fields):
    if kind == "arxiv":
        identity = "10.48550/arxiv." + identity.split("v", 1)[0]
    path = identity if kind == "openalex" else "doi:" + quote(identity, safe="/")
    return _openalex_request("/" + path, select=fields)


def _one(paper):
    return [paper] if paper else []


def lookup(args):
    kind, identity = _identifier(args.get("id"))
    entries = [("openalex", lambda: _one(_openalex_paper(_openalex_seed(kind, identity, OPENALEX_FIELDS))))]
    if kind == "arxiv":
        entries.insert(0, ("arxiv", lambda: _arxiv_feed(id_list=identity, max_results=1)))
    if kind == "doi":
        def crossref():
            remote = json.loads(workspace.fetch_source("https://api.crossref.org/works/" + quote(identity, safe="")))
            return _one(_crossref_paper(remote["message"]))
        entries.insert(0, ("crossref", crossref))
    with ThreadPoolExecutor(max_workers=len(entries)) as pool:
        results = list(pool.map(lambda entry: _attempt(*entry), entries))
    statuses, batches = zip(*results)
    papers = _merge(batches)
    return {"lookup": identity, "identifierType": kind, "paper": papers[0] if papers else None,
            "providers": list(statuses)}


def neighbors(args):
    kind, identity = _identifier(args.get("id"))
    limit = _limit(args)
    direction = args.get("direction", "both")
    if direction not in ("references", "cited_by", "both"):
        raise workspace.WorkspaceError(400, "引文方向须为 references、cited_by 或 both。")
    seed = {}

    def resolve():
        seed.update(_openalex_seed(kind, identity, OPENALEX_FIELDS + ",referenced_works"))
        return _one(_openalex_paper(seed))

    status, papers = _attempt("openalex", resolve)
    if not papers:
        return {"lookup": identity, "seed": None, "seedStatus": status}
    result = {"lookup": identity, "seed": papers[0], "seedStatus": status}

    def list_papers(filter_value):
        records = _openalex_request(filter=filter_value, per_page=limit, select=OPENALEX_FIELDS)["results"]
        return [paper for row in records if (paper := _openalex_paper(row))]

    if direction in ("references", "both"):
        identifiers = [value.rsplit("/", 1)[-1] for value in seed.get("referenced_works") or []]
        identifiers = [value for value in identifiers if re.fullmatch(r"W\d+", value)]
        status, rows = _attempt("openalex", lambda: list_papers("openalex:" + "|".join(identifiers[:limit])) if identifiers else [])
        result["references"] = {"papers": rows, "indexed": len(identifiers), **status}
    if direction in ("cited_by", "both"):
        work_id = papers[0]["openAlexId"].rsplit("/", 1)[-1]
        if not re.fullmatch(r"W\d+", work_id):
            raise workspace.WorkspaceError(502, "论文来源返回了无效的引文索引标识。")
        status, rows = _attempt("openalex", lambda: list_papers("cites:" + work_id))
        result["citedBy"] = {"papers": rows, "indexed": seed.get("cited_by_count"), **status}
    return result


class _ArxivRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        target = urlsplit(url)
        if target.scheme != "https" or target.hostname not in ("arxiv.org", "export.arxiv.org"):
            raise URLError("Unsupported arXiv redirect")
        return super().redirect_request(request, file, code, message, headers, url)


def read_arxiv(identity, page):
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    if not (isinstance(identity, str) and (match := ARXIV_ID.fullmatch(identity.strip()))):
        raise workspace.WorkspaceError(400, "请输入 arXiv 论文编号，如 1706.03762v1。")
    identity = match.group(1).lower()
    url = "https://arxiv.org/pdf/" + identity
    limit = 25 * 1024 * 1024
    missing = 0
    opener = build_opener(_ArxivRedirect())
    for endpoint in (url, "https://export.arxiv.org/pdf/" + identity):
        try:
            with opener.open(Request(endpoint, headers={"User-Agent": "Weave/1.0"}), timeout=12) as response:
                body = response.read(limit + 1)
        except HTTPError as error:
            missing += error.code == 404
            continue
        except OSError:
            continue
        if len(body) > limit:
            raise workspace.WorkspaceError(413, "论文 PDF 超过 25 MiB。")
        if body.startswith(b"%PDF-") and b"%%EOF" in body[-4096:]:
            break
    else:
        if missing == 2:
            raise workspace.WorkspaceError(404, "arXiv 没有找到该论文版本。")
        raise workspace.WorkspaceError(502, "暂时无法从 arXiv 读取完整的 PDF。")
    try:
        reader = PdfReader(BytesIO(body))
        if page > len(reader.pages):
            raise workspace.WorkspaceError(400, "页码超出范围。")
        text = (reader.pages[page - 1].extract_text() or "")[:30000]
    except PdfReadError as error:
        raise workspace.WorkspaceError(502, "无法解析该论文 PDF。") from error
    return {"page": page, "pages": len(reader.pages), "text": text,
            "evidenceLevel": "full_text" if text.strip() else "no_extractable_text",
            "source": {"arxivId": identity, "url": url, "location": f"PDF p. {page}"}}
