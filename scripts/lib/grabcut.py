"""
Segment one photograph into layers, with no machine-learning model.

A GrabCut: colour models for foreground and background, a graph whose cut
costs what it would cost to disagree with them, and a minimum cut that
settles it. Implemented on numpy and scipy's max-flow because this
container has no OpenCV and no network to fetch a model from — and because
for a single hero photograph a graph cut is both better and more
inspectable than a segmentation network.

    unary      -log likelihood under a k-means-initialised Gaussian
               mixture, one for foreground and one for background
    pairwise   contrast-sensitive: neighbours that look alike are
               expensive to separate, neighbours across an edge are cheap
    cut        scipy.sparse.csgraph.maximum_flow, then a walk of the
               residual graph from the source

Iterating — cut, refit the mixtures on the new labels, cut again —
is what turns a rough rectangle into an outline that follows hair.
"""
from __future__ import annotations
import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import maximum_flow

SCALE = 400          # capacities are integers; this is the resolution of one unit


# ── colour ──────────────────────────────────────────────────────────────
def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    a = rgb.astype(np.float64) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ M.T
    t = xyz / np.array([0.95047, 1.0, 1.08883])
    d = 6.0 / 29.0
    f = np.where(t > d ** 3, np.cbrt(t), t / (3 * d * d) + 4.0 / 29.0)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


# ── a mixture, initialised by k-means and left there ────────────────────
class ColourModel:
    """Diagonal-covariance Gaussian mixture over Lab, seeded by k-means.

    GrabCut's own mixtures are initialised exactly this way; running EM on
    top buys very little once the components are in the right places, and
    costs a loop that can diverge.
    """

    def __init__(self, X: np.ndarray, k: int = 6, seed: int = 0):
        rng = np.random.default_rng(seed)
        n = len(X)
        k = max(1, min(k, n))
        # k-means++ so the components do not collapse together
        C = [X[rng.integers(n)]]
        for _ in range(k - 1):
            d = np.min(((X[:, None, :] - np.array(C)[None]) ** 2).sum(-1), axis=1)
            s = d.sum()
            C.append(X[rng.choice(n, p=d / s)] if s > 0 else X[rng.integers(n)])
        C = np.array(C)
        for _ in range(24):
            lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
            new = np.array([X[lab == i].mean(0) if np.any(lab == i) else C[i]
                            for i in range(k)])
            if np.allclose(new, C, atol=1e-3):
                C = new
                break
            C = new
        lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)

        self.mu, self.var, self.w = [], [], []
        for i in range(k):
            m = lab == i
            cnt = int(m.sum())
            if cnt < 8:
                continue
            self.mu.append(X[m].mean(0))
            self.var.append(X[m].var(0) + 4.0)      # floor, or a flat component explodes
            self.w.append(cnt / n)
        self.mu = np.array(self.mu)
        self.var = np.array(self.var)
        self.w = np.array(self.w)

    def nll(self, X: np.ndarray) -> np.ndarray:
        """Negative log likelihood, one value per row of X."""
        d = X[:, None, :] - self.mu[None]
        e = -0.5 * ((d * d) / self.var[None]).sum(-1)
        norm = -0.5 * np.log(self.var.prod(1) * (2 * np.pi) ** X.shape[1])
        p = np.exp(e + norm[None]) @ self.w
        return -np.log(np.maximum(p, 1e-300))


# ── the graph ───────────────────────────────────────────────────────────
def _neighbour_edges(Lab: np.ndarray, gamma: float):
    """4-neighbour smoothness, contrast-sensitive.

    beta is set from the mean squared colour difference over the image, as
    in Boykov & Jolly — it is what makes the same gamma work on a dark
    interior and on a bright one.
    """
    H, W, _ = Lab.shape
    idx = np.arange(H * W).reshape(H, W)

    dr = Lab[1:, :, :] - Lab[:-1, :, :]
    dc = Lab[:, 1:, :] - Lab[:, :-1, :]
    sq_r = (dr * dr).sum(-1)
    sq_c = (dc * dc).sum(-1)

    mean_sq = (sq_r.sum() + sq_c.sum()) / max(sq_r.size + sq_c.size, 1)
    beta = 1.0 / (2.0 * max(mean_sq, 1e-6))

    w_r = gamma * np.exp(-beta * sq_r)
    w_c = gamma * np.exp(-beta * sq_c)

    a = np.concatenate([idx[:-1, :].ravel(), idx[:, :-1].ravel()])
    b = np.concatenate([idx[1:, :].ravel(), idx[:, 1:].ravel()])
    w = np.concatenate([w_r.ravel(), w_c.ravel()])
    return a, b, w


def _min_cut(N, src_cap, snk_cap, ea, eb, ew):
    """Build the flow network, cut it, and return the foreground mask."""
    S, T = N, N + 1
    rows = np.concatenate([np.full(N, S), ea, eb, np.arange(N)])
    cols = np.concatenate([np.arange(N), eb, ea, np.full(N, T)])
    data = np.concatenate([src_cap, ew, ew, snk_cap]).astype(np.int64)
    data = np.clip(data, 0, 2 ** 31 - 2).astype(np.int32)

    g = csr_matrix((data, (rows, cols)), shape=(N + 2, N + 2))
    res = maximum_flow(g, S, T)

    # residual capacity, then the set reachable from the source
    resid = (g - res.flow).tocsr()
    seen = np.zeros(N + 2, dtype=bool)
    seen[S] = True
    stack = [S]
    indptr, indices, vals = resid.indptr, resid.indices, resid.data
    while stack:
        u = stack.pop()
        lo, hi = indptr[u], indptr[u + 1]
        nb = indices[lo:hi][vals[lo:hi] > 0]
        for v in nb:
            if not seen[v]:
                seen[v] = True
                stack.append(v)
    return seen[:N]          # reachable from source == foreground


def grabcut(rgb: np.ndarray,
            probably_fg: np.ndarray,
            definitely_bg: np.ndarray | None = None,
            iters: int = 4,
            k: int = 6,
            gamma: float = 55.0,
            seed: int = 0) -> np.ndarray:
    """Return a boolean foreground mask the size of the image.

    probably_fg    where the subject is expected; everything else starts
                   as background and may stay there
    definitely_bg  pixels that must not become foreground, whatever the
                   colour model thinks
    """
    H, W, _ = rgb.shape
    Lab = srgb_to_lab(rgb)
    X = Lab.reshape(-1, 3)
    N = H * W

    fg = probably_fg.ravel().copy()
    hard_bg = (definitely_bg.ravel() if definitely_bg is not None
               else np.zeros(N, dtype=bool))

    ea, eb, ew = _neighbour_edges(Lab, gamma)
    ew_i = (ew * SCALE).astype(np.int64)
    HARD = int(9 * gamma * SCALE)          # larger than any sum of neighbour weights

    for it in range(iters):
        if fg.sum() < 32 or (~fg).sum() < 32:
            break
        fgm = ColourModel(X[fg], k=k, seed=seed + it)
        bgm = ColourModel(X[~fg], k=k, seed=seed + 100 + it)

        # cost of calling a pixel background / foreground
        src = (bgm.nll(X) * SCALE)          # cutting src means "background"
        snk = (fgm.nll(X) * SCALE)

        src[hard_bg] = 0
        snk[hard_bg] = HARD

        new = _min_cut(N, src.astype(np.int64), snk.astype(np.int64), ea, eb, ew_i)
        if new.sum() < 32:
            break
        if np.array_equal(new, fg):
            fg = new
            break
        fg = new

    return fg.reshape(H, W)
