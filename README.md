

<div align="center">
<h1>Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity</h1>

[![PyPI](https://img.shields.io/pypi/v/verbalized-sampling?style=for-the-badge&logo=pypi&logoColor=white)](https://pypi.org/project/verbalized-sampling/) [![Python](https://img.shields.io/pypi/pyversions/verbalized-sampling?style=for-the-badge&logo=python&logoColor=white&label=)](https://pypi.org/project/verbalized-sampling/) [![Homepage](https://img.shields.io/badge/Homepage-4d8cd8?style=for-the-badge&logo=google-chrome&logoColor=white)](https://www.verbalized-sampling.com/) [![Paper](https://img.shields.io/badge/Paper-2510.01171-red?style=for-the-badge)](https://arxiv.org/abs/2510.01171)  [![Blog](https://img.shields.io/badge/Blog-4d8cd8?style=for-the-badge&logo=notion&logoColor=white)](https://simonucl.notion.site/verbalized-sampling) [![HuggingFace](https://img.shields.io/badge/🤗%20Datasets-FFD21E?style=for-the-badge)](https://huggingface.co/collections/CHATS-Lab/verbalized-sampling)
</div>

---

<p align="center">
  <a href="#quickstart">Quickstart</a> | 
  <a href="#installation-and-usage">Install</a> | 
  <a href="#colab-notebooks">Colab</a> | 
  <a href="#reproducing-paper-results">Reproduce Results</a> | 
  <a href="https://arxiv.org/abs/2510.01171">Paper</a> | 
  <a href="https://simonucl.notion.site/verbalized-sampling">Blog</a> | 
  <a href="https://tinyurl.com/vs-gallery">Examples</a> | 
  <a href="https://x.com/dch/status/1978471395173740900">Practical Tips</a> |
  <a href="https://www.youtube.com/watch?v=VoBdywmdim0">Podcast</a> | 
  <a href="#citation">Citation</a>
</p>

**Verbalized Sampling (VS)** is a simple prompting strategy that improves LLM diversity by 2-3x. It works by asking the model to generate multiple responses with their probabilities, then sampling from this distribution. VS is **training-free** (works with any LLM via prompting), **model-agnostic** (GPT, Claude, Gemini, Llama, etc.), **orthogonal to temperature**, and effective across tasks like **creative writing**, **social simulation**, **synthetic data generation**, and **open-ended QA**.

## Quickstart

To try Verbalized Sampling, just copy and paste this into any chatbot (ChatGPT, Claude, Gemini, etc.). For best results, we recommend starting with models like GPT-5, Claude 4 Opus, and Gemini 2.5 Pro:

```
<instructions>
Generate 5 responses to the user query, each within a separate <response> tag. Each <response> must include a <text> and a numeric <probability>.
Please sample at random from the tails of the distribution, such that the probability of each response is less than 0.10.
</instructions>

Tell me a short story about a bear.
```

If you want more stories, just respond and ask `Tell me 5 more stories` in the same conversation. For even better results, paste this into a `system prompt` instead:

```
You are a helpful assistant. For each query, please generate a set of five possible responses, each within a separate <response> tag. Each <response> must include a <text> and a numeric <probability>.
Please sample at random from the tails of the distribution, such that the probability of each response is less than 0.10.
```
For practical tips on getting the most out of this technique and general troubleshooting, please refer to this [X/Twitter thread](https://x.com/dch/status/1978471395173740900)!

## Installation and Usage

For all of the above in a single function call, the ability to automatically sample from the verbalized responses, and LangChain integration, use our Python package:

```bash
pip install verbalized-sampling
```

```python
# Set OPENAI_API_KEY or OPENROUTER_API_KEY in bash
from verbalized_sampling import verbalize

# Generate distribution of responses
dist = verbalize("Tell me a joke", k=5, tau=0.10, temperature=0.9)

# Sample from the distribution
joke = dist.sample(seed=42)
print(joke.text)
```

## Colab Notebooks

Here are some examples of how to use verbalized sampling for generating more diverse stories, ideas, images, and how to use our package:

| Notebook                           | Description                                                                                                                                  | Code                                             | Run it Yourself!                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct vs. Verbalized Sampling** | Head-to-head comparison demonstrating VS effectiveness: 2-3x diversity improvement in creative tasks while maintaining quality               | [View on GitHub](notebooks/vs_base.ipynb)        | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/1UDk4W5w6gF0dQ9Tpu0sPQethEht51GXL#offline=true&sandboxMode=true) |
| **Image Generation with VS**       | Visual comparison of Direct Prompting vs. Verbalized Sampling for text-to-image generation, showcasing creative diversity in artistic styles | [View on GitHub](notebooks/vs_with_image.ipynb)  | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/1J18VJRnrCjIb6sTivY-znb8C3JsLQCIz#offline=true&sandboxMode=true) |
| **Complete Framework Tutorial**    | Step-by-step guide to using verbalized sampling: API basics, transforms, selection methods, recipes, and advanced features                   | [View on GitHub](notebooks/framework_demo.ipynb) | [![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/drive/1eC0nIUVC1kyANxxzhNib44qmPphdWy9o#offline=true&sandboxMode=true) |

## Reproducing Paper Results

Our library includes everything you need to reproduce the results from our paper. For example:

```bash
# Run creative writing experiments
python scripts/tasks/run_poem.py --model gpt-4.1 --methods direct vs_standard --num-responses 50

# Evaluate bias mitigation on geographic data
python scripts/tasks/run_state_name.py --model anthropic/claude-sonnet-4 --methods direct vs_standard

# Compare diversity metrics across methods
python scripts/tasks/run_story.py --model gpt-4.1 --methods direct vs_standard vs_cot --metrics diversity ngram
```

For complete experiment instructions with exact commands, parameter settings, and expected outputs, see **[EXPERIMENTS.md](scripts/EXPERIMENTS.md)** which provides 1-to-1 mapping between paper sections and experiment scripts.

### HF Datasets
We also released the generated datasets in our lab's HF Space. Please check the corresponding README for the exact schema.
**📦 Full Collection:** https://huggingface.co/collections/CHATS-Lab/verbalized-sampling

| Task | Dataset |
|------|---------|
| **Joke Generation**| [🤗 Verbalized-Sampling-Joke-Generation](https://huggingface.co/datasets/CHATS-Lab/Verbalized-Sampling-Joke-Generation) |
| **Random Number Generation** | [🤗 Verbalized-Sampling-Random-Number-Generator](https://huggingface.co/datasets/CHATS-Lab/Verbalized-Sampling-Random-Number-Generator) | 
| **Open-Ended QA** | [🤗 Verbalized-Sampling-Open-Ended-QA](https://huggingface.co/datasets/CHATS-Lab/Verbalized-Sampling-Open-Ended-QA) |
| **Dialogue Simulation** | [🤗 Verbalized-Sampling-Dialogue-Simulation](https://huggingface.co/datasets/CHATS-Lab/Verbalized-Sampling-Dialogue-Simulation) |
| **Synthetic Data (Math)** | [🤗 Verbalized-Sampling-Synthetic-Data-Generation](https://huggingface.co/datasets/CHATS-Lab/Verbalized-Sampling-Synthetic-Data-Generation) |
  
## autocut — prompt-driven video editing

[`autocut/`](autocut/README.md) is an applied tool that lives in this repo: you
describe a film in one sentence and it analyses the rushes, writes an edit
decision list, and renders finished masters in every aspect ratio you need. It
runs entirely on ffmpeg — no other runtime dependency.

```bash
autocut auto "20s vertical teaser, moody and slow, open on the model, \
tagline: \"it's yours\"" --rushes ./rushes --out ./out
```

With `--llm` it plans by eliciting *k* distinct edits with their own
probabilities through `verbalize()`, rather than collapsing to one mode-seeking
answer — the same idea as the rest of this repository, applied to a cut. Every
candidate is compiled and validated deterministically, and with no model
available it falls back to deterministic variants.

See [autocut/README.md](autocut/README.md).

## Citation

If you use Verbalized Sampling in your research, please cite our paper:

```bibtex
@misc{zhang2025verbalizedsamplingmitigatemode,
  title={Verbalized Sampling: How to Mitigate Mode Collapse and Unlock LLM Diversity},
  author={Jiayi Zhang and Simon Yu and Derek Chong and Anthony Sicilia and Michael R. Tomz and Christopher D. Manning and Weiyan Shi},
  year={2025},
  eprint={2510.01171},
  archivePrefix={arXiv},
  primaryClass={cs.CL},
  url={https://arxiv.org/abs/2510.01171}
}
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
