import { test, expect, type Page } from '@playwright/test';

test.describe('US-003: Scorecard Capture with Mandatory Rubric Dimensions and Recommendation Submission', () => {
    let page: Page;
    let scorecardId: string;
    let interviewStageId: string;

    test.beforeEach(async ({ page: p }) => {
        page = p;
        
        // Login as interviewer
        await page.goto('/login');
        await page.fill('input[name="email"]', 'interviewer@example.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');
        
        // Wait for navigation to dashboard
        await page.waitForURL('**/dashboard', { timeout: 5000 });
    });

    test('Scenario 1: Load scorecard with stage-appropriate rubric (technical)', async () => {
        // Given: interviewer is assigned to a technical interview
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');

        // Find and click on a technical interview
        const technicalInterview = page.locator('[data-interview-type="technical"]').first();
        await technicalInterview.click();
        await page.waitForURL('**/interviews/**');

        // When: they navigate to the scorecard form
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // Then: technical rubric dimensions are displayed
        const expectedDimensions = [
            'Problem Solving',
            'Code Quality',
            'System Design',
            'Communication'
        ];

        for (const dimension of expectedDimensions) {
            const dimensionCard = page.getByText(dimension);
            await expect(dimensionCard).toBeVisible({ timeout: 3000 });
        }

        // Verify each dimension has Likert scale (1-5)
        const likertOptions = page.locator('input[type="radio"][value="5"]');
        const count = await likertOptions.count();
        expect(count).toBe(expectedDimensions.length);
    });

    test('Scenario 1b: Load scorecard with stage-appropriate rubric (cultural-fit)', async () => {
        // Given: interviewer is assigned to a cultural-fit interview
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');

        // Find and click on a cultural-fit interview
        const culturalInterview = page.locator('[data-interview-type="cultural_fit"]').first();
        await culturalInterview.click();
        await page.waitForURL('**/interviews/**');

        // When: they navigate to the scorecard form
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // Then: cultural-fit rubric dimensions are displayed
        const expectedDimensions = [
            'Values Alignment',
            'Team Collaboration',
            'Growth Mindset',
            'Leadership Potential'
        ];

        for (const dimension of expectedDimensions) {
            const dimensionCard = page.getByText(dimension);
            await expect(dimensionCard).toBeVisible({ timeout: 3000 });
        }
    });

    test('Scenario 2: All rubric dimensions must be scored before submitting', async () => {
        // Given: interviewer opens a scorecard form
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
        
        const interview = page.locator('[data-testid="interview-card"]').first();
        await interview.click();
        
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // When: they score only 3 of 4 dimensions
        const problemSolvingScore = page.locator('input[name="Problem Solving-score"][value="4"]');
        await problemSolvingScore.click();

        const codeQualityScore = page.locator('input[name="Code Quality-score"][value="5"]');
        await codeQualityScore.click();

        const systemDesignScore = page.locator('input[name="System Design-score"][value="3"]');
        await systemDesignScore.click();

        // Wait for auto-save to complete
        await page.waitForTimeout(1000);

        // Then: submit button should be disabled
        const submitButton = page.getByRole('button', { name: /Submit Scorecard/i });
        await expect(submitButton).toBeDisabled();

        // Verify validation message is displayed
        const validationMessage = page.getByText(/Please (score all dimensions|complete all dimensions)/i);
        await expect(validationMessage).toBeVisible();

        // Verify progress indicator shows incomplete status
        const progressBar = page.locator('[data-testid="completion-progress"]');
        await expect(progressBar).toBeVisible();
        const progressText = await progressBar.textContent();
        expect(progressText).toMatch(/75%|3\/4/); // 3 out of 4 dimensions

        // When: they score the final dimension
        const communicationScore = page.locator('input[name="Communication-score"][value="4"]');
        await communicationScore.click();

        // Wait for auto-save
        await page.waitForTimeout(1000);

        // When: they also select a recommendation
        const recommendButton = page.getByRole('button', { name: /Advance|advance to next stage/i });
        await recommendButton.click();

        // Wait for auto-save
        await page.waitForTimeout(1000);

        // Then: submit button should become enabled
        await expect(submitButton).toBeEnabled({ timeout: 2000 });
    });

    test('Scenario 3: Scorecard submitted and locked', async () => {
        // Given: interviewer has completed all dimensions and selected recommendation
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
        
        const interview = page.locator('[data-testid="interview-card"]').first();
        await interview.click();
        
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // Score all 4 dimensions
        await page.locator('input[name="Problem Solving-score"][value="5"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Code Quality-score"][value="4"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="System Design-score"][value="4"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Communication-score"][value="5"]').click();
        await page.waitForTimeout(600);

        // Select recommendation
        const advanceButton = page.getByRole('button', { name: /Advance|advance to next stage/i });
        await advanceButton.click();
        await page.waitForTimeout(600);

        // When: they click submit
        const submitButton = page.getByRole('button', { name: /Submit Scorecard/i });
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // Then: confirmation dialog appears
        page.once('dialog', async dialog => {
            expect(dialog.message()).toContain('Are you sure');
            expect(dialog.message()).toContain('not be able to edit');
            await dialog.accept();
        });

        // Wait for submission to complete
        await page.waitForTimeout(2000);

        // Verify success indicators
        // Check for "Submitted" badge
        const submittedBadge = page.getByText(/Submitted/i);
        await expect(submittedBadge).toBeVisible({ timeout: 3000 });

        // Verify aggregate score is displayed
        const aggregateScore = page.locator('[data-testid="aggregate-score"]');
        await expect(aggregateScore).toBeVisible();
        const scoreText = await aggregateScore.textContent();
        expect(scoreText).toMatch(/4\.[58]/); // Should be 4.5 or 4.8 based on scores

        // Verify submitted date is shown
        const submittedDate = page.locator('[data-testid="submitted-at"]');
        await expect(submittedDate).toBeVisible();

        // Verify form is now read-only (all inputs disabled)
        const radioInputs = page.locator('input[type="radio"]');
        const radioCount = await radioInputs.count();
        for (let i = 0; i < radioCount; i++) {
            await expect(radioInputs.nth(i)).toBeDisabled();
        }

        const textareas = page.locator('textarea');
        const textareaCount = await textareas.count();
        for (let i = 0; i < textareaCount; i++) {
            await expect(textareas.nth(i)).toBeDisabled();
        }

        // Verify recommendation buttons are disabled
        const recommendationButtons = page.locator('[data-testid^="recommendation-"]');
        const btnCount = await recommendationButtons.count();
        for (let i = 0; i < btnCount; i++) {
            await expect(recommendationButtons.nth(i)).toBeDisabled();
        }

        // Verify submit button is hidden or disabled
        const submitButtonAfter = page.getByRole('button', { name: /Submit Scorecard/i });
        await expect(submitButtonAfter).toBeHidden().catch(async () => {
            await expect(submitButtonAfter).toBeDisabled();
        });
    });

    test('Scenario 4: Partial save allows return before submission', async () => {
        // Given: interviewer starts filling out a scorecard
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
        
        const interview = page.locator('[data-testid="interview-card"]').first();
        await interview.click();
        
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // Get the scorecard ID from URL for returning later
        const url = page.url();
        const scorecardIdMatch = url.match(/scorecards\/([^\/]+)/);
        scorecardId = scorecardIdMatch ? scorecardIdMatch[1] : '';

        // When: they score 2 of 4 dimensions
        await page.locator('input[name="Problem Solving-score"][value="4"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Code Quality-score"][value="5"]').click();
        await page.waitForTimeout(600);

        // Add notes to one dimension
        const problemSolvingNotes = page.locator('textarea[name="Problem Solving-notes"]');
        await problemSolvingNotes.fill('Excellent analytical approach to the coding challenge');
        await page.waitForTimeout(600); // Wait for auto-save

        // Verify save indicator shows "Saved"
        const saveIndicator = page.locator('[data-testid="save-indicator"]');
        await expect(saveIndicator).toContainText(/Saved/i);

        // When: they navigate away
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // And: they return to the same scorecard
        await page.goto(url);
        await page.waitForLoadState('networkidle');

        // Then: previously scored dimensions should be pre-filled
        const problemSolvingScoreRadio = page.locator('input[name="Problem Solving-score"][value="4"]');
        await expect(problemSolvingScoreRadio).toBeChecked();

        const codeQualityScoreRadio = page.locator('input[name="Code Quality-score"][value="5"]');
        await expect(codeQualityScoreRadio).toBeChecked();

        // Verify notes are preserved
        const notesField = page.locator('textarea[name="Problem Solving-notes"]');
        await expect(notesField).toHaveValue('Excellent analytical approach to the coding challenge');

        // Verify unscored dimensions remain empty
        const systemDesignScores = page.locator('input[name="System Design-score"]:checked');
        const systemDesignCount = await systemDesignScores.count();
        expect(systemDesignCount).toBe(0);

        // Verify submit button is still disabled (incomplete)
        const submitButton = page.getByRole('button', { name: /Submit Scorecard/i });
        await expect(submitButton).toBeDisabled();

        // When: they complete the remaining dimensions
        await page.locator('input[name="System Design-score"][value="4"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Communication-score"][value="4"]').click();
        await page.waitForTimeout(600);

        // Select recommendation
        const holdButton = page.getByRole('button', { name: /Hold|hold for review/i });
        await holdButton.click();
        await page.waitForTimeout(600);

        // Then: submit button should become enabled
        await expect(submitButton).toBeEnabled({ timeout: 2000 });

        // They should be able to submit successfully
        await submitButton.click();

        // Accept confirmation dialog
        page.once('dialog', async dialog => {
            await dialog.accept();
        });

        // Wait for submission
        await page.waitForTimeout(2000);

        // Verify submission succeeded
        const submittedBadge = page.getByText(/Submitted/i);
        await expect(submittedBadge).toBeVisible({ timeout: 3000 });
    });

    test('Edge case: Recommendation selection is also required for submission', async () => {
        // Given: interviewer has scored all dimensions but not selected recommendation
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
        
        const interview = page.locator('[data-testid="interview-card"]').first();
        await interview.click();
        
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // Score all 4 dimensions
        await page.locator('input[name="Problem Solving-score"][value="3"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Code Quality-score"][value="3"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="System Design-score"][value="3"]').click();
        await page.waitForTimeout(300);
        
        await page.locator('input[name="Communication-score"][value="3"]').click();
        await page.waitForTimeout(600);

        // Then: submit button should still be disabled (no recommendation)
        const submitButton = page.getByRole('button', { name: /Submit Scorecard/i });
        await expect(submitButton).toBeDisabled();

        // Verify validation message mentions recommendation
        const validationMessage = page.getByText(/recommendation/i);
        await expect(validationMessage).toBeVisible();

        // When: they select a recommendation
        const rejectButton = page.getByRole('button', { name: /Reject/i });
        await rejectButton.click();
        await page.waitForTimeout(600);

        // Then: submit button should become enabled
        await expect(submitButton).toBeEnabled({ timeout: 2000 });
    });

    test('Auto-save functionality preserves work continuously', async () => {
        // Given: interviewer is filling out a scorecard
        await page.goto('/interviews');
        await page.waitForLoadState('networkidle');
        
        const interview = page.locator('[data-testid="interview-card"]').first();
        await interview.click();
        
        const scorecardButton = page.getByRole('button', { name: /Complete Scorecard|Start Scorecard/i });
        await scorecardButton.click();
        await page.waitForURL('**/scorecards/**');

        // When: they make a change
        await page.locator('input[name="Problem Solving-score"][value="5"]').click();

        // Then: save indicator should show "Saving..."
        const saveIndicator = page.locator('[data-testid="save-indicator"]');
        await expect(saveIndicator).toContainText(/Saving/i, { timeout: 1000 });

        // And: after debounce period, should show "Saved"
        await expect(saveIndicator).toContainText(/Saved/i, { timeout: 2000 });

        // When: they make another change quickly
        await page.locator('input[name="Code Quality-score"][value="4"]').click();
        await page.waitForTimeout(100);
        
        // Add notes
        const notesField = page.locator('textarea[name="Code Quality-notes"]');
        await notesField.fill('Good practices demonstrated');

        // Then: save indicator should debounce and eventually show saved
        await expect(saveIndicator).toContainText(/Saving/i, { timeout: 1000 });
        await expect(saveIndicator).toContainText(/Saved/i, { timeout: 2000 });

        // Verify progress bar updates accordingly
        const progressText = page.locator('[data-testid="completion-progress"]');
        await expect(progressText).toContainText(/50%|2\/4/i);
    });
});
