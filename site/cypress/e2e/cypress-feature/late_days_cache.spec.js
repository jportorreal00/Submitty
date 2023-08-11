import {buildUrl} from '/cypress/support/utils.js';

const predictedStatus = (days_allowed, days_late, remaining) => {

    if (days_late === 0) {
        return 'Good';
    }
    else if (days_late <= days_allowed && days_late <= remaining) {
        // Valid
        return 'Late';
    }
    else if (days_late > remaining) {
        // Bad (too many for term)
        return 'Bad (too many late days used this term)';
    }
    else {
        // Bad (too many for assignment)
        return 'Bad (too many late days used on this assignment)';
    }
};

const calculateCache = () => {
    // Get cache recalculation request
    cy.intercept('GET', buildUrl(['sample', 'bulk_late_days', 'calculate'])).as('calculateCache');

    // Calculate all cache
    cy.get('button').contains('Calculate Info').click();
    cy.get('#rebuild-status-label').should('be.visible');

    // Wait for query to finish
    cy.wait('@calculateCache', {timeout: 300000});

    // Wait for recalculation to finish
    cy.get('#rebuild-status-label', {timeout: 15000}).should('not.be.visible');

    for (const user_id of all_user_ids) {
        cy.get(`[data-user="${user_id}""] > [data-before-content="Late Days Remaining"]`)
            .then((cell) => expect(cell.text().trim()).not.to.equal(''));
    }
};

const checkStudentsInCache = () => {
    cy.login('instructor');
    cy.visit(['sample', 'bulk_late_days']);
    for (const user_id of all_user_ids) {
        // Gradeable # of late days used should be empty
        cy.get(`[data-user="${user_id}"] > [data-before-content="Late Allowed Homework"]`)
            .then((cell) => expect(cell.text().trim()).to.equal(''));

        // Remaining late days isnt known, should be empty
        cy.get(`[data-user="${user_id}"] > [data-before-content="Late Days Remaining"]`)
            .then((cell) => expect(cell.text().trim()).to.equal(''));
    }
};

const CheckStatusUpdated = (exceptions_given, late_days_remaining) => {

    for (const user_id of all_user_ids) {
        cy.login(user_id);
        cy.visit(['sample', 'late_table']);
        // Wait for login change to take place
        const status = predictedStatus(1 ,Math.max(0,all_late_users[user_id]-exceptions_given), late_days_remaining);

        // Find late day status within the row in the late day usage table
        cy.get('td[data-before-content="Event/Assignment"]')
            .contains("Late Allowed Homework")
            .siblings('td[data-before-content="Status"]')
            .contains(status)
            .should('exist');

        cy.logout();
    }
};
// Object with user_ids that have late submissions for gradeables
const all_late_users = {}; // {user_id: #days_late}
const all_user_ids = [];

all_late_users['moscie'] = 3;
all_user_ids.push('moscie');
// Submission is 3 days late and 0 late days => Bad (too many late days used this term)
// After given 2 late days => Bad (too many late days used this term)
// Or After given 2 extentions => Bad (too many late days used this term)
all_late_users['barteh'] = 2;
all_user_ids.push('barteh');
// Submission is 2 days late and 0 late days => Bad (too many late days used this term)
// After given 2 late days => Bad (too many late days used on this assignment) because only 1 late day is allowed
// Or After given 2 extentions => Good
all_late_users['harbel'] = 1;
all_user_ids.push('harbel');
// Submission is 1 day late and 0 late days => Bad (too many late days used this term)
// After given 2 late days => Late (valid submission)
// Or After given 2 extentions => Good

describe('Test cases involving late day cache updates', () => {
    // Ignore uncaught js exceptions
    Cypress.on('uncaught:exception', () => {
        return false;
    });

    describe('Test accessing Bulk Late Days page as a student', () => {
        it('should not allow access', () => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('student');
            cy.get('.content').contains("You don't have access to this page");
        });
    });

    describe('Test accessing Bulk Late Days as an instructor', () => {
        it('should load properly', () => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            cy.get('#late-day-table');
            calculateCache();
        });
    });

    describe(`Test students with late submissions`, () => {
        it('should have 0 late days used on bulk late days table', () => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            // 0 late days should be charged
            for (const user_id of all_user_ids) {
                cy.get(`[data-user="${user_id}"] > [data-before-content="Late Allowed Homework"]`)
                    .contains('0')
                    .should('exist');
            }
        });
    });

    describe('Test changes to late days allowed table', () => {
        it('should grant students with 2 late days', () => {
            cy.visit(['sample', 'late_days']);
            cy.login('instructor');

            for (const user_id of all_user_ids) {
                const days = 2;
                // update the number of late days
                cy.get('#user_id').type(user_id);
                cy.get('#datestamp').type('1972-01-01', {force: true});
                cy.get('#user_id').click(); // dismiss the calendar view
                cy.get('#late_days').clear();
                cy.get('#late_days').type(days);
                cy.get('input[type=submit]').click();
                if (user_id !== 'harbel') {
                    cy.wait(2000);
                }
            }
        });

        it('should make bulk late days has been emptied out', () => {
            checkStudentsInCache();
        });

        it('should make sure late day status has updated', () => {
            CheckStatusUpdated(0,2);
        });

        it('should remove late day cache after deletion of late days', () => {
            cy.visit(['sample', 'late_days']);
            cy.login('instructor');

            const deleteLateDays = () => {
                cy.get('div.content').then((table) => {
                    if (table.find('td[data-before-content="Delete"]').length > 0) {
                        cy.get('td[data-before-content="Delete"]').should('exist').first().click();
                        deleteLateDays();
                    }
                });
            };
            // Delete late day entry if any exist
            deleteLateDays();
            // View bulk late day changes
            checkStudentsInCache();
        });
    });

    describe('Test changes to late day extensions', () => {
        before(() => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            calculateCache();
        });

        it.only('should grant students with extensions', () => {
            cy.visit(['sample', 'extensions']);

            cy.get('#gradeable-select').select("Late Allowed Homework");
            for (const user_id of all_user_ids) {
                // update the number of late days
                cy.get('#user_id').type(user_id);
                cy.get('#late-days').type(2, {force: true});
                cy.get('#extensions-form')
                    .find('a')
                    .contains('Submit')
                    .should('exist')
                    .click();
                if (user_id != 'harbel') {
                    cy.wait(2000);
                }
            }            
        });

        it('should make bulk late days has been emptied out', () => {
            checkStudentsInCache();
        });

        it('should make sure late day status has updated', () => {
            CheckStatusUpdated(2,0);
        });

        it.only('should remove late day cache after deletion of extension', () => {
            cy.visit(['sample', 'extensions']);
            cy.login('instructor');

            const deleteExtensions = () => {
                cy.get('body').then((body) => {
                    if (body.find('#extensions-table').length > 0) {
                        cy.get('#extensions-table > tbody > tr > td > a').should('exist').first().click();
                        deleteExtensions();
                    }
                });
            };

            // Delete late day extension if any exist
            cy.get('#gradeable-select').select('Late Allowed Homework');
            deleteExtensions();
            // View bulk late day changes
            checkStudentsInCache(); 
        });
    });

    describe('Test changes to gradeable info', () => {
        beforeEach(() => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            calculateCache();

            cy.visit(['sample', 'gradeable', 'late_allowed_homework', 'update?nav_tab=5']);

            cy.get('.breadcrumb > span').should('have.text', 'Edit Gradeable');
        });

        it('Changes gradeable due date', () => {
            cy.get('#date_due')
                .clear()
                .type('1972-01-02 11:59:59')
                .click();
            cy.get('#late_days').click(); // Dismiss calender and trigger save

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            // Gradeable # of late days used should be empty
            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"] ~`)
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });

        it('Changes gradeable due date back', () => {
            cy.get('#date_due')
                .clear()
                .type('1972-01-01 11:59:59')
                .click();
            cy.get('#late_days').click(); // Dismiss calender and trigger save

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"] ~`)
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });

        it('Disables gradeable due date', () => {
            cy.get('#has_due_date_no').check();

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            // Bulk late days should not have gradeable title
            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"]`).should('have.length', 0);

        });

        it('Re-enables gradeable due date', () => {
            cy.get('#has_due_date_yes').check();

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            // Bulk late days should have gradeable title
            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"]`).should('have.length.gt', 0);

        });

        it('Disables late days', () => {
            cy.get('#no_late_submission').check();

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"]`).should('have.length', 0);

        });

        it('Re-enables late days', () => {
            cy.get('#yes_late_submission').check();

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"]`).should('have.length.gt', 0);

        });

        it('Changes late days allowed', () => {
            cy.get('#late_days')
                .clear()
                .type('1')
                .click();
            cy.get('#date_due').click(); // Dismiss calender and trigger save

            cy.get('#save_status', {timeout:10000}).should('have.text', 'All Changes Saved');

            cy.visit(['sample', 'bulk_late_days']);

            cy.get(`#late-day-table > tbody > tr > [data-before-content="Late Allowed Homework"] ~`)
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });
    });

    describe('Test changes to gradeable versions', () => {

        before(() => {
            cy.writeFile(`cypress/fixtures/submission.txt`, 'test');
        });

        beforeEach(() => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            calculateCache();
            cy.visit(['sample', 'gradeable', 'late_allowed_homework']);
        });

        it('Adds a new submission', () => {
            // Make student submission
            cy.get('#radio-student').check();
            cy.get('#user_id').type('student');

            // attatch file
            cy.get('#input-file1').attachFile('submission.txt');
            cy.get('#submit').click();

            // Confirm dialog box
            cy.get('#previous-submission-form')
                .find('input')
                .contains('Submit')
                .click();

            // Check cache
            cy.visit(['sample', 'bulk_late_days']);
            cy.get(`[data-user-content='student'][data-before-content="Late Allowed Homework"] ~`)
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });

        it('Cancels submission', () => {
            // Click do not grade
            cy.get('#do_not_grade').click();
            // Note: page refresh triggers a late day recalulation for banner text

            // Check cache
            cy.visit(['sample', 'late_table']);

            cy.get('td[data-before-content='Event/Assignment']')
                .contains('Late Allowed Homework')
                .siblings('td[data-before-content='Status']')
                .contains('Cancelled Submission')
                .should('exist');
        });

        it('Add gradeable version back', () => {
            // Select gradeable
            cy.get('#submission-version-select').select('1');

            // Change the version to grade
            cy.get('#version_change').click();
            // Note: page refresh triggers a late day recalulation for banner text

            // Check cache
            cy.visit(['sample', 'late_table']);

            cy.get('td[data-before-content="Event/Assignment"]')
                .contains("Late Allowed Homework")
                .siblings('td[data-before-content="Status"]')
                .should('not.contain', 'Cancelled Submission')
                .should('exist');
        });
    });

    describe('Test gradable creation/deletion', () => {

        beforeEach(() => {
            cy.visit(['sample', 'bulk_late_days']);
            cy.login('instructor');
            calculateCache();
        });

        it('Creates a gradeable', () => {
            cy.visit(['sample', 'gradeable']);

            // Enter gradeable info
            cy.get('#g_title').type('Delete Me');
            cy.get('#g_id').type('deleteme');
            cy.get('#radio_ef_student_upload').check();
            // Create Gradeable
            cy.get('#create-gradeable-btn').click();

            // Check that cache is deleted
            cy.visit(['sample', 'bulk_late_days']);
            cy.get(`#late-day-table > tbody > tr > [data-before-content="Delete Me"] ~`)
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });

        it('Deletes a gradeable', () => {
            cy.visit(['sample']);
            cy.get(`#deleteme > div > a.fa-trash`).click();

            // Confirm delete
            cy.get('form[name='delete-confirmation']')
                .find('input')
                .contains('Delete')
                .click();

            // Check that cache is deleted
            cy.visit(['sample', 'bulk_late_days']);
            cy.get(`#late-day-table > tbody > tr > [data-before-content="Delete Me"]`).should('have.length', 0);

        });
    });

    describe('Test changes to initial late days', () => {
        it('Changes default late days', () => {
            cy.visit(['sample', 'config']);
            cy.login('instructor');

            cy.get('#default-student-late-days')
                .clear()
                .type('1');

            // Remove focus to trigger config change
            cy.get('#default-hw-late-days').click();

            cy.visit(['sample', 'bulk_late_days']);

            cy.get('[data-before-content="Initial Late Days"]')
                .each((cell) => expect(cell.text().trim()).to.equal('1'));
            cy.get('#late-day-table > tbody > tr > [data-before-content="Initial Late Days"] ~')
                .then((cell) => expect(cell.text().trim()).to.equal(''));
        });
    });
});