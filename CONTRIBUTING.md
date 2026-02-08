# Contributing to SmallSteps

Thank you for your interest in contributing to SmallSteps! We appreciate your support in making this project better.

## How to Contribute

### Reporting Issues

If you encounter a bug or have a feature request:

1. **Check existing issues** to see if it's already been reported
2. **Create a new issue** with a clear title and description
3. **Include details** such as:
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (browser, OS)

### Submitting Changes

1. **Fork the repository** and create a new branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the project's philosophy:
   - Keep the user experience gentle and non-overwhelming
   - Follow the existing code style and patterns
   - Maintain the DRY principle
   - Use the established design system (see user rules in README)

3. **Test your changes** thoroughly
   - Ensure the app builds without errors
   - Test the feature/fix in the browser
   - Verify no existing functionality breaks

4. **Commit your changes** with clear, descriptive messages
   ```bash
   git commit -m "Add: brief description of your change"
   ```

5. **Push to your fork** and submit a pull request
   ```bash
   git push origin feature/your-feature-name
   ```

### Pull Request Guidelines

- Provide a clear description of what your PR does
- Reference any related issues (e.g., "Fixes #123")
- Keep changes focused - one feature/fix per PR
- Be open to feedback and iteration

## Development Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Code Style

- Follow the existing patterns in the codebase
- Use TypeScript for type safety
- Keep components focused and reusable
- Avoid duplicating code (DRY principle)

## Questions?

Feel free to open an issue for any questions or clarifications. We're here to help!

---

**Note**: SmallSteps is built on principles of reducing cognitive load and supporting gentle, consistent action. Please keep this philosophy in mind when contributing.
