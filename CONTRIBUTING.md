[中文](docs/zh/guides/contributing.md) | [English](CONTRIBUTING.md)

# Cherry Law 贡献指南

欢迎加入 Cherry Law 贡献者社区！我们致力于使 Cherry Law 成为法律业务场景中提供长期价值的项目，并希望能邀请更多的开发者加入我们。无论您是经验丰富的开发者，还是刚刚起步的新手，您的贡献都将帮助我们更好地服务法律行业用户并提高软件质量。

## 如何贡献

以下是您可以参与的几种方式：

1.  **贡献代码**：帮助我们开发新功能或优化现有代码。请确保您的代码符合我们的编码标准并通所有测试。

2.  **修复 Bug**：如果您发现 bug，欢迎提交修复。请在提交前确认问题已解决，并包含相关测试。

3.  **维护 Issue**：帮助我们在 GitHub 上管理 issue，协助标记、分类和解决问题。

4.  **产品设计**：参与产品设计讨论，帮助我们改善用户体验和界面设计。

5.  **编写文档**：帮助我们完善用户手册、API 文档和开发者指南。

6.  **社区维护**：参与社区讨论，帮助回答用户问题，促进社区活跃。

7.  **推广使用**：通过博客、社交媒体和其他渠道推广 Cherry Law，以吸引更多的用户和开发者。

## 在您开始之前

请确保您已阅读[行为准则](CODE_OF_CONDUCT.md)和[许可证 (LICENSE)](LICENSE)。

## 快速入门

为了帮助您熟悉代码库，我们建议您先处理标有以下标签之一的 issue：[good-first-issue](https://github.com/CherryHQ/cherry-studio/labels/good%20first%20issue)、[help-wanted](https://github.com/CherryHQ/cherry-studio/labels/help%20wanted) 或 [kind/bug](https://github.com/CherryHQ/cherry-studio/labels/kind%2Fbug)。任何帮助都是欢迎的。

### 测试

没有测试的功能被视为不存在。为了确保代码真正有效，相关流程应由单元测试和功能测试覆盖。因此，在考虑贡献时，请同时考虑可测试性。所有测试都可以在本地运行，不依赖于 CI。请参阅[开发者指南](docs/zh/guides/development.md)中的“测试”部分。

### 拉取请求的自动化测试

自动化测试由 Cherry Studio 组织的成员开启的拉取请求 (PR) 触发，草稿 (draft) PR 除外。由新贡献者开启的 PR 最初将标记为 `needs-ok-to-test` 标签，并且不会自动测试。一旦 Cherry Studio 组织成员在 PR 中添加 `/ok-to-test`，测试流水线将被创建。

### 考虑将您的拉取请求开启为草稿

并非所有拉取请求在创建时都已准备好进行评审。这可能是因为作者想要发起讨论，他们不完全确定更改的方向是否正确，或者更改尚未完成。请考虑将这些 PR 创建为[草稿拉取请求 (draft pull requests)](https://github.blog/2019-02-14-introducing-draft-pull-requests/)。草稿 PR 会被 CI 跳过，从而节省 CI 资源。这也意味着评审者不会被自动分配，社区会理解该 PR 尚未准备好进行评审。
在您将草稿拉取请求标记为准备评审后，评审者将被分配。

### 贡献者对项目条款的遵守

我们要求每位贡献者证明他们有权合法地为我们的项目做出贡献。贡献者通过自觉签署（sign off）其提交来表达这一点，从而表明他们遵守[许可证 (LICENSE)](LICENSE)。
签署的提交是指提交消息包含以下内容：

您可以使用以下命令生成签署的提交 [git commit --signoff](https://git-scm.com/docs/git-commit#Documentation/git-commit.txt---signoff)：

```
git commit --signoff -m "您的提交消息"
```

### 获取代码评审/合并

维护者会在这里帮助您在合理的时间范围内实现您的用例。他们会尽力及时评审您的代码并提供建设性的反馈。但是，如果您在评审过程中遇到阻碍，或者觉得您的拉取请求没有得到应有的关注，请通过 Issue 中的评论或通过[社区](README.md#-community)联系我们。

### 参与测试计划

测试计划旨在为用户提供更稳定的应用体验和更快的迭代速度。详情请参阅[测试计划](docs/zh/guides/test-plan.md)。

### 其他建议

- **联系开发者**：在提交 PR 之前，您可以先联系开发者进行讨论或获取帮助。

## 重要贡献指南和重点领域

在提交拉取请求之前，请查看以下关键信息：

### 数据变更功能 PR 的临时限制 🚫

**目前，我们不接受引入 Redux 数据模型或 IndexedDB 模式更改的功能拉取请求。**

我们的核心团队目前专注于涉及这些数据结构的重大架构更新。为了在此期间确保稳定性和重点，此类性质的贡献将暂时由内部管理。

*   **需要更改 Redux 状态形状或 IndexedDB 模式的 PR 将被关闭。**
*   **此限制是暂时的，将随着 `v2.0.0` 的发布而解除。** 您可以在 issue [#10162](https://github.com/CherryHQ/cherry-studio/pull/10162) 跟踪 `v2.0.0` 及其相关讨论的进度。

我们高度鼓励以下方面的贡献：
*   Bug 修复 🐞
*   性能改进 🚀
*   文档更新 📚
*   **不改变** Redux 数据模型或 IndexedDB 模式的功能（例如：UI 增强、新组件、细微重构）。 ✨

感谢您在这个重要的开发阶段的理解和持续支持。谢谢！


## 联系我们

如果您有任何问题或建议，欢迎通过以下方式联系我们：

- 微信：kangfenmao
- [GitHub Issues](https://github.com/CherryHQ/cherry-studio/issues)

感谢您的支持和贡献！我们期待与您合作，让 Cherry Studio 成为更好的产品。
