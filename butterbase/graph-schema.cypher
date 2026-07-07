// ============================================================================
// savoir knowledge graph — schema (Neo4j / Aura)
//
// Recreate everything with one command (from the savoir/ repo root):
//   cat butterbase/graph-schema.cypher | neo4j-cli query --credential aura --rw
//
// Everything is idempotent (IF NOT EXISTS), so it is safe to re-run.
// Statements are split on a ';' at end of line by neo4j-cli.
//
// NOTE ON RELATIONSHIPS: Neo4j has no DDL to constrain relationship endpoints
// (e.g. "MEMBER_OF only connects Person->Team"). Relationships come into
// existence with data. The model below is the source of truth for which edges
// are allowed; the relationship property indexes register the edge types and
// speed up common lookups.
// ============================================================================


// ---------------------------------------------------------------------------
// NODE TYPES — uniqueness constraints (each defines the label's identity key)
// ---------------------------------------------------------------------------
CREATE CONSTRAINT person_email     IF NOT EXISTS FOR (n:Person)       REQUIRE n.email IS UNIQUE;
CREATE CONSTRAINT team_name        IF NOT EXISTS FOR (n:Team)         REQUIRE n.name  IS UNIQUE;
CREATE CONSTRAINT project_key      IF NOT EXISTS FOR (n:Project)      REQUIRE n.key   IS UNIQUE;
CREATE CONSTRAINT repo_name        IF NOT EXISTS FOR (n:Repo)         REQUIRE n.name  IS UNIQUE;
CREATE CONSTRAINT service_name     IF NOT EXISTS FOR (n:Service)      REQUIRE n.name  IS UNIQUE;
CREATE CONSTRAINT skill_name       IF NOT EXISTS FOR (n:Skill)        REQUIRE n.name  IS UNIQUE;
CREATE CONSTRAINT issue_id         IF NOT EXISTS FOR (n:Issue)        REQUIRE n.id    IS UNIQUE;
CREATE CONSTRAINT pr_id            IF NOT EXISTS FOR (n:PR)           REQUIRE n.id    IS UNIQUE;
CREATE CONSTRAINT commit_sha       IF NOT EXISTS FOR (n:Commit)       REQUIRE n.sha   IS UNIQUE;
CREATE CONSTRAINT slackmessage_id  IF NOT EXISTS FOR (n:SlackMessage) REQUIRE n.id    IS UNIQUE;
CREATE CONSTRAINT doc_id           IF NOT EXISTS FOR (n:Doc)          REQUIRE n.id    IS UNIQUE;
CREATE CONSTRAINT topic_name       IF NOT EXISTS FOR (n:Topic)        REQUIRE n.name  IS UNIQUE;
CREATE CONSTRAINT incident_id      IF NOT EXISTS FOR (n:Incident)     REQUIRE n.id    IS UNIQUE;


// ---------------------------------------------------------------------------
// RELATIONSHIP MODEL (allowed edges)
//
//   People & org
//     (Person)-[:MEMBER_OF {since, role}]->(Team)
//     (Person)-[:HAS_SKILL {level}]->(Skill)
//     (Person)-[:WORKS_ON {role}]->(Project)
//     (Team)-[:OWNS]->(Service)
//     (Team)-[:RESPONSIBLE_FOR]->(Repo)
//
//   Code & delivery
//     (Repo)-[:PART_OF]->(Project)
//     (Service)-[:DEPLOYED_FROM]->(Repo)
//     (Service)-[:DEPENDS_ON]->(Service)
//     (Commit)-[:IN_REPO]->(Repo)
//     (Person)-[:AUTHORED {at}]->(PR)
//     (Person)-[:REVIEWED {at, state}]->(PR)
//     (PR)-[:MERGES]->(Commit)
//     (PR)-[:TOUCHES]->(Repo)
//     (PR)-[:RESOLVES]->(Issue)
//
//   Work tracking
//     (Person)-[:OPENED {at}]->(Issue)
//     (Issue)-[:ASSIGNED_TO]->(Person)
//     (Issue)-[:ABOUT]->(Topic)
//
//   Knowledge & comms
//     (Doc)-[:ABOUT]->(Topic)
//     (Doc)-[:DOCUMENTS]->(Service)
//     (Person)-[:POSTED {at}]->(SlackMessage)
//     (SlackMessage)-[:MENTIONS]->(Topic)
//     (SlackMessage)-[:REFERENCES]->(Incident)
//
//   Reliability
//     (Incident)-[:AFFECTS]->(Service)
//     (Incident)-[:RESOLVED_BY]->(PR)
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// RELATIONSHIP PROPERTY INDEXES — register edge types + speed common lookups
// ---------------------------------------------------------------------------
CREATE INDEX rel_member_of_since  IF NOT EXISTS FOR ()-[r:MEMBER_OF]-() ON (r.since);
CREATE INDEX rel_has_skill_level  IF NOT EXISTS FOR ()-[r:HAS_SKILL]-()  ON (r.level);
CREATE INDEX rel_works_on_role    IF NOT EXISTS FOR ()-[r:WORKS_ON]-()   ON (r.role);
CREATE INDEX rel_authored_at      IF NOT EXISTS FOR ()-[r:AUTHORED]-()   ON (r.at);
CREATE INDEX rel_reviewed_at      IF NOT EXISTS FOR ()-[r:REVIEWED]-()   ON (r.at);
CREATE INDEX rel_opened_at        IF NOT EXISTS FOR ()-[r:OPENED]-()     ON (r.at);
CREATE INDEX rel_posted_at        IF NOT EXISTS FOR ()-[r:POSTED]-()     ON (r.at);


// ---------------------------------------------------------------------------
// SECONDARY NODE INDEXES — non-key properties used for lookups/search
// ---------------------------------------------------------------------------
CREATE INDEX person_name  IF NOT EXISTS FOR (n:Person)   ON (n.name);
CREATE INDEX pr_state     IF NOT EXISTS FOR (n:PR)       ON (n.state);
CREATE INDEX issue_state  IF NOT EXISTS FOR (n:Issue)    ON (n.state);
CREATE INDEX incident_sev IF NOT EXISTS FOR (n:Incident) ON (n.severity);
