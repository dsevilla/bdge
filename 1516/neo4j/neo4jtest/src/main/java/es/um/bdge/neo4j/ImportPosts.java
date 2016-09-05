package es.um.bdge.neo4j;

import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Properties;
import java.util.zip.GZIPInputStream;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.apache.commons.csv.QuoteMode;

import iot.jcypher.database.DBAccessFactory;
import iot.jcypher.database.DBProperties;
import iot.jcypher.database.DBType;
import iot.jcypher.database.IDBAccess;
import iot.jcypher.graph.GrLabel;
import iot.jcypher.graph.GrNode;
import iot.jcypher.graph.GrProperty;
import iot.jcypher.graph.GrRelation;
import iot.jcypher.graph.Graph;
import iot.jcypher.query.JcQuery;
import iot.jcypher.query.JcQueryResult;
import iot.jcypher.query.api.IClause;
import iot.jcypher.query.factories.clause.CREATE;
import iot.jcypher.query.factories.clause.CREATE_UNIQUE;
import iot.jcypher.query.factories.clause.MATCH;
import iot.jcypher.query.factories.clause.RETURN;
import iot.jcypher.query.result.JcError;
import iot.jcypher.query.values.JcNode;
import iot.jcypher.query.values.JcNumber;
import iot.jcypher.query.writer.Format;
import iot.jcypher.util.Util;

public class ImportPosts 
{
	private static IDBAccess dbAccess;
	private static String userId = "neo4j";
	private static String password = "neo";
	
	public static void main(String[] args)
	{
		new ImportPosts().run(args);
	}
	
	private void run(String[] args)
	{
		/** initialize connection to a Neo4j database */
		initDBConnection();
		
		/** execute queries against the database */
		importNodes(args[0]);
//		createMovieDatabaseByGraphModel();
//		createAdditionalNodes();
		
		/** close the connection to a Neo4j database */
		closeDBConnection();
	}
	
	/**
	 * Create the movie database
	 */
	void importNodes(String filename) 
	{
		int counter = 0;
		Map<String,String> answers_posts = new HashMap<String,String>();
		Iterable<CSVRecord> records = parseCSV(filename);
		
		if (records == null)
			return;
		
		Graph graph = Graph.create(dbAccess);
		
		for (CSVRecord record : records)
		{
			String postType = record.get("PostTypeId");
			GrNode n = graph.createNode();
			
			// Post?
			if (Integer.parseInt(postType) == 1)
			{
				n.addLabel("Post");
				n.addProperty("Title", record.get("Title"));
			}
			else
			{
				n.addLabel("Answer");
				
				// Añadir relación al padre (post)
				answers_posts.put(record.get("Id"), record.get("ParentId"));
			}
			
			for (String s : new String[]{"Id", "CreationDate","DeletionDate",
					"Score","ViewCount","Body",
					"Tags","AnswerCount","CommentCount","FavoriteCount"})
				n.addProperty(s, record.get(s));
			
			// "OwnerDisplayName"
			
			if (++counter == 1000)
			{
				System.out.print(".");
				graph.store();
				graph = Graph.create(dbAccess);
				counter = 0;
			}
		}
		graph.store();
		
		// Añadir las relaciones
		for (Entry<String, String> e: answers_posts.entrySet())
		{
			JcNode post = new JcNode("post");
			JcNode answer = new JcNode("answer");
			
			System.out.println(e.getValue() + "<-" + e.getKey());
			
			JcQuery query = new JcQuery();
			query.setClauses(new IClause[] {
					MATCH.node(post).label("Post")
						.property("Id").value(e.getValue()),
					MATCH.node(answer).label("Answer")
						.property("Id").value(e.getKey()),
					CREATE_UNIQUE.node(answer).relation().out().type("ANSWERS").node(post)
			});
			
			JcQueryResult result = dbAccess.execute(query);
			if (result.hasErrors())
				printErrors(result);	
		}
	}

	private static Iterable<CSVRecord> parseCSV(String filename)
	{
		Reader in;
		try {
			InputStream fileStream = new FileInputStream(filename);
			InputStream gzipStream = new GZIPInputStream(fileStream);
			in = new InputStreamReader(gzipStream, "UTF-8");
			//in = new FileReader("path/to/file.csv");

			Iterable<CSVRecord> records = CSVFormat.EXCEL.withHeader()
					.withQuoteMode(QuoteMode.ALL).parse(in);
			return records;
		} catch (FileNotFoundException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (IOException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}	
		return null;
	}
	
	/**
	 * Check how many nodes we have
	 */
	static void queryNodeCount() {
		JcQuery query;
		JcQueryResult result;
		
		String queryTitle = "COUNT NODES";
		JcNode n = new JcNode("n");
		JcNumber nCount = new JcNumber("nCount");
		
		query = new JcQuery();
		query.setClauses(new IClause[] {
				MATCH.node(n),
				RETURN.count().value(n).AS(nCount)
		});
		/** map to CYPHER statements and map to JSON, print the mapping results to System.out.
	     This will show what normally is created in the background when accessing a Neo4j database*/
		print(query, queryTitle, Format.PRETTY_3);
		
		/** execute the query against a Neo4j database */
		result = dbAccess.execute(query);
		if (result.hasErrors())
			printErrors(result);
		
		/** print the JSON representation of the query result */
		print(result, queryTitle);
		
		List<BigDecimal> nr = result.resultOf(nCount);
		System.out.println(nr.get(0));
		return;
	}
	
	/**
	 * Query the entire graph
	 */
	static void queryMovieGraph() {
		
		String queryTitle = "MOVIE_GRAPH";
		JcNode movie = new JcNode("movie");
		JcNode actor = new JcNode("actor");
		
		/*******************************/
		JcQuery query = new JcQuery();
		query.setClauses(new IClause[] {
				MATCH.node(actor).label("Actor").relation().out().type("ACTS_IN").node(movie),
				RETURN.value(actor),
				RETURN.value(movie)
		});
		/** map to CYPHER statements and map to JSON, print the mapping results to System.out.
	     This will show what normally is created in the background when accessing a Neo4j database*/
		print(query, queryTitle, Format.PRETTY_3);
		
		/** execute the query against a Neo4j database */
		JcQueryResult result = dbAccess.execute(query);
		if (result.hasErrors())
			printErrors(result);
		
		/** print the JSON representation of the query result */
		print(result, queryTitle);
		
		List<GrNode> actors = result.resultOf(actor);
		List<GrNode> movies = result.resultOf(movie);
		
		print(actors, true);
		print(movies, true);
		
		return;
	}
	
	/**
	 * initialize connection to a Neo4j database
	 */
	private void initDBConnection() {
		Properties props = new Properties();
		
		// properties for remote access and for embedded access
		// (not needed for in memory access)
		// have a look at the DBProperties interface
		// the appropriate database access class will pick the properties it needs
		props.setProperty(DBProperties.SERVER_ROOT_URI, "http://localhost:7474");
		//props.setProperty(DBProperties.DATABASE_DIR, "C:/NEO4J_DBS/01");
		
		/** connect to an in memory database (no properties are required) */
		//dbAccess = DBAccessFactory.createDBAccess(DBType.IN_MEMORY, props);
		
		/** connect to remote database via REST (SERVER_ROOT_URI property is needed) */
		dbAccess = DBAccessFactory.createDBAccess(DBType.REMOTE, props, userId, password);
		
		/** connect to an embedded database (DATABASE_DIR property is needed) */
		//dbAccess = DBAccessFactory.createDBAccess(DBType.EMBEDDED, props);
	}
	
	/**
	 * close the connection to a Neo4j database
	 */
	private void closeDBConnection() {
		if (dbAccess != null) {
			dbAccess.close();
			dbAccess = null;
		}
	}
	
	/**
	 * map to CYPHER statements and map to JSON, print the mapping results to System.out
	 * @param query
	 * @param title
	 * @param format
	 */
	private static void print(JcQuery query, String title, Format format) {
		System.out.println("QUERY: " + title + " --------------------");
		// map to Cypher
		String cypher = iot.jcypher.util.Util.toCypher(query, format);
		System.out.println("CYPHER --------------------");
		System.out.println(cypher);
		
		// map to JSON
		String json = iot.jcypher.util.Util.toJSON(query, format);
		System.out.println("");
		System.out.println("JSON   --------------------");
		System.out.println(json);
		
		System.out.println("");
	}
	
	/**
	 * print the JSON representation of the query result
	 * @param queryResult
	 */
	private static void print(JcQueryResult queryResult, String title) {
		System.out.println("RESULT OF QUERY: " + title + " --------------------");
		String resultString = Util.writePretty(queryResult.getJsonResult());
		System.out.println(resultString);
	}
	
	private static void print(List<GrNode> nodes, boolean distinct) {
		List<Long> ids = new ArrayList<Long>();
		StringBuilder sb = new StringBuilder();
		boolean firstNode = true;
		for (GrNode node : nodes) {
			if (!ids.contains(node.getId()) || !distinct) {
				ids.add(node.getId());
				if (!firstNode)
					sb.append("\n");
				else
					firstNode = false;
				sb.append("---NODE---:\n");
				sb.append('[');
				sb.append(node.getId());
				sb.append(']');
				for (GrLabel label : node.getLabels()) {
					sb.append(", ");
					sb.append(label.getName());
				}
				sb.append("\n");
				boolean first = true;
				for (GrProperty prop : node.getProperties()) {
					if (!first)
						sb.append(", ");
					else
						first = false;
					sb.append(prop.getName());
					sb.append(" = ");
					sb.append(prop.getValue());
				}
			}
		}
		System.out.println(sb.toString());
	}
	
	/**
	 * print errors to System.out
	 * @param result
	 */
	private static void printErrors(JcQueryResult result) {
		StringBuilder sb = new StringBuilder();
		sb.append("---------------General Errors:");
		appendErrorList(result.getGeneralErrors(), sb);
		sb.append("\n---------------DB Errors:");
		appendErrorList(result.getDBErrors(), sb);
		sb.append("\n---------------end Errors:");
		String str = sb.toString();
		System.out.println("");
		System.out.println(str);
	}
	
	/**
	 * print errors to System.out
	 * @param result
	 */
	private static void printErrors(List<JcError> errors) {
		StringBuilder sb = new StringBuilder();
		sb.append("---------------Errors:");
		appendErrorList(errors, sb);
		sb.append("\n---------------end Errors:");
		String str = sb.toString();
		System.out.println("");
		System.out.println(str);
	}
	
	private static void appendErrorList(List<JcError> errors, StringBuilder sb) {
		int num = errors.size();
		for (int i = 0; i < num; i++) {
			JcError err = errors.get(i);
			sb.append('\n');
			if (i > 0) {
				sb.append("-------------------\n");
			}
			sb.append("codeOrType: ");
			sb.append(err.getCodeOrType());
			sb.append("\nmessage: ");
			sb.append(err.getMessage());
			if (err.getAdditionalInfo() != null) {
				sb.append("\nadditional info: ");
				sb.append(err.getAdditionalInfo());
			}
		}
	}

}
